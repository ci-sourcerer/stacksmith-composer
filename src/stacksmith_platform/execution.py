import hashlib
import io
import json
import os
import subprocess
import sys
import tarfile
import time
from pathlib import Path

import httpx
from cryptography.fernet import Fernet

from .configuration import config_arguments

MAX_HANDOFF = 1024**3
PROVIDER_CACHE = Path("/work/home/.cache/terragrunt/providers")


def _download(url):
    output = bytearray()
    with httpx.stream("GET", url, timeout=120, follow_redirects=True) as response:
        response.raise_for_status()
        for chunk in response.iter_bytes():
            output.extend(chunk)
            if len(output) > MAX_HANDOFF:
                raise ValueError("Execution handoff exceeds size limit")
    return bytes(output)


def _extract(content, destination):
    with tarfile.open(fileobj=io.BytesIO(content)) as archive:
        if sum(member.size for member in archive.getmembers()) > 4 * MAX_HANDOFF:
            raise ValueError("Expanded execution workspace exceeds size limit")
        archive.extractall(destination, filter="data")


def _archive(path):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode="w:gz", dereference=False) as archive:
        _archive_member(archive, path, "workspace", path.resolve())
    if output.tell() > MAX_HANDOFF:
        raise ValueError("Execution context exceeds size limit")
    return output.getvalue()


def _archive_member(archive, path, name, workspace):
    if path.is_symlink():
        target = path.resolve()
        if target.is_relative_to(workspace):
            member = archive.gettarinfo(path, arcname=name)
            member.linkname = os.path.relpath(target, path.parent.resolve())
            archive.addfile(member)
            return
        if not target.is_relative_to(PROVIDER_CACHE.resolve()):
            raise ValueError("Workspace symlink points outside the execution context")
        # Provider caches live outside the workspace and disappear between phases.
        _archive_member(archive, target, name, workspace)
        return
    member = archive.gettarinfo(path, arcname=name)
    if member.isfile():
        with path.open("rb") as source:
            archive.addfile(member, source)
    elif member.isdir():
        archive.addfile(member)
        for child in sorted(path.iterdir()):
            _archive_member(archive, child, f"{name}/{child.name}", workspace)
    elif member.islnk():
        archive.addfile(member)
    else:
        raise ValueError("Workspace contains an unsupported file type")


def _checkout(payload, directory):
    response = httpx.get(
        f"https://api.github.com/repos/{payload['repository']}/tarball/{payload['revision']}",
        headers={"Authorization": f"Bearer {payload['github_token']}"},
        timeout=30,
        follow_redirects=False,
    )
    if response.status_code != 302 or not response.headers.get(
        "location", ""
    ).startswith("https://codeload.github.com/"):
        raise ValueError("GitHub did not return an immutable source archive")
    _extract(_download(response.headers["location"]), directory / "checkout")
    entries = list((directory / "checkout").iterdir())
    if len(entries) != 1 or not entries[0].is_dir():
        raise ValueError("Invalid repository archive")
    entries[0].rename(directory / "workspace")


def _environment(payload):
    if payload.get("allow_local_backend") and payload.get("action") not in {
        "plan",
        "plan-operation",
    }:
        raise ValueError("Local backend overrides are restricted to test plans")
    return {
        "PATH": os.environ["PATH"],
        "HOME": "/work/home",
        "LANG": "C.UTF-8",
        "FORCE_COLOR": "1",
        "TERM": "xterm-256color",
        "STACKSMITH_GIT_TOKEN": payload["github_token"],
        "STACKSMITH_WARN_ON_UNLOCKED": "0",
        **payload["credentials"],
        **(
            {"STACKSMITH_CI_SKIP_BACKEND_VALIDATION": "1"}
            if payload.get("allow_local_backend")
            else {}
        ),
        "STACKSMITH_CI_SUMMARY_FORMAT": "none",
    }


def _prepare(payload, workspace, environment):
    command = [
        "stacksmith",
        "ci",
        "prepare",
        "--command",
        payload.get("command", payload["action"]),
        "--config-ref",
        payload["config"],
        "--gitops-root",
        payload["settings"]["gitops_root"],
        "--discovery-mode",
        payload["settings"]["discovery_mode"],
        "--environments",
        payload["environment"],
        "--event-name",
        "pull_request" if payload["event"] == "pull_request" else "push",
        "--ref-name",
        payload["default_branch"],
        "--default-branch",
        payload["default_branch"],
        "--after",
        payload["revision"],
        "--env-file",
        "/dev/null",
        "--format",
        "json",
    ]
    if payload["settings"].get("locked", True):
        command.append("--locked")
    if payload["operations"]:
        command.extend(["--operation-names", ",".join(payload["operations"])])
    result = subprocess.run(
        command,
        shell=False,
        cwd=workspace,
        env=environment,
        stdout=subprocess.PIPE,
        timeout=payload["timeout"],
        check=False,
    )
    if result.returncode:
        return result.returncode
    manifest = json.loads(result.stdout)
    if manifest.get("version") != 2 or [
        item["environment"] for item in manifest.get("matrix", [])
    ] != [payload["environment"]]:
        raise ValueError("Unsupported or mismatched Stacksmith CI manifest")
    (workspace / ".platform-manifest.json").write_text(json.dumps(manifest))
    return 0


def _execute(payload, workspace):
    environment = _environment(payload)
    Path(environment["HOME"]).mkdir(parents=True, exist_ok=True)
    if payload["phase"] == "prepare":
        return _prepare(payload, workspace, environment)
    if (
        hashlib.sha256((workspace / ".platform-manifest.json").read_bytes()).hexdigest()
        != payload["manifest_digest"]
    ):
        raise ValueError("Prepared manifest digest changed")
    if payload["phase"] in {"apply", "destroy"}:
        plan = workspace / ".stacksmith-ci" / payload["environment"] / "reviewed.tfplan"
        if (
            not plan.is_file()
            or hashlib.sha256(plan.read_bytes()).hexdigest() != payload["plan_digest"]
        ):
            raise ValueError("Reviewed plan digest changed")
    return subprocess.run(
        [
            "stacksmith",
            "ci",
            "execute",
            "--manifest",
            ".platform-manifest.json",
            "--environment",
            payload["environment"],
            "--phase",
            payload["phase"],
            "--validation-report-output",
            f".stacksmith-ci/{payload['environment']}/validation-report.json",
        ],
        shell=False,
        cwd=workspace,
        env=environment,
        timeout=payload["timeout"],
        check=False,
    ).returncode


def _inspect(payload, directory):
    from .adapter import _authoring_response

    inspection = payload["inspection"]
    if inspection["args"] == ["platform-operations"]:
        return _inspect_operations(payload, directory)
    workspace = directory / "workspace"
    workspace.mkdir()
    args = inspection["args"]
    if inspection["source"] is not None:
        (workspace / "stack.yaml").write_text(inspection["source"])
        args = [*args, "--stack", str(workspace / "stack.yaml")]
    if inspection["config_source"] is not None:
        (workspace / "config.yaml").write_text(inspection["config_source"])
    result = subprocess.run(
        [
            "stacksmith",
            *args,
            *(
                []
                if inspection["authoring_request"] is not None
                else [
                    *config_arguments(
                        str(workspace / "config.yaml")
                        if inspection["config_source"] is not None
                        else inspection["config"]
                    ),
                    "--build-dir",
                    str(workspace / "build"),
                ]
            ),
        ],
        shell=False,
        input=json.dumps(inspection["authoring_request"])
        if inspection["authoring_request"] is not None
        else None,
        capture_output=True,
        text=True,
        cwd=workspace,
        env={
            "PATH": os.environ["PATH"],
            "HOME": "/work",
            **(
                {"STACKSMITH_GIT_TOKEN": inspection["github_token"]}
                if inspection["github_token"]
                else {}
            ),
        },
        timeout=payload["timeout"],
        check=False,
    )
    return {
        "exit_code": result.returncode,
        "revision": payload["revision"],
        "phase": "inspect",
        "inspection_output": json.dumps(_authoring_response(result))
        if inspection["authoring_request"] is not None
        else result.stdout,
    }


def _inspect_operations(payload, directory):
    inspection = payload["inspection"]
    source = json.loads(inspection["source"])
    _checkout({**source, "github_token": inspection["github_token"]}, directory)
    result = subprocess.run(
        [sys.executable, "-m", "stacksmith_platform.operations"],
        input=json.dumps(source),
        shell=False,
        capture_output=True,
        text=True,
        cwd=directory / "workspace",
        env={
            "PATH": os.environ["PATH"],
            "HOME": "/work/home",
            "STACKSMITH_GIT_TOKEN": inspection["github_token"],
        },
        timeout=payload["timeout"],
        check=False,
    )
    return {
        "exit_code": result.returncode,
        "revision": payload["revision"],
        "phase": "inspect",
        "inspection_output": result.stdout,
    }


def _result(payload, workspace, exit_code):
    result = {
        "exit_code": exit_code,
        "revision": payload["revision"],
        "phase": payload["phase"],
        "reports": {},
    }
    if (workspace / ".platform-manifest.json").is_file():
        result["manifest_digest"] = hashlib.sha256(
            (workspace / ".platform-manifest.json").read_bytes()
        ).hexdigest()
    for name in (
        "plan-summary.json",
        "apply-summary.json",
        "stacksmith-report.json",
        "validation-report.json",
    ):
        path = workspace / ".stacksmith-ci" / payload["environment"] / name
        if path.is_file() and path.stat().st_size < 4_000_000:
            result["reports"][name] = json.loads(path.read_text())
    plan = workspace / ".stacksmith-ci" / payload["environment"] / "reviewed.tfplan"
    if plan.is_file():
        result["plan_digest"] = hashlib.sha256(plan.read_bytes()).hexdigest()
    result["stacksmith_version"] = subprocess.run(
        ["stacksmith", "--version"],
        shell=False,
        capture_output=True,
        text=True,
        timeout=10,
        check=True,
    ).stdout.strip()
    return result


def main() -> None:
    """Claim and execute exactly one authorized isolated phase.

    Returns:
        None; exits with the phase's process status.

    Raises:
        httpx.HTTPError: Artifact handoff or claim service is unavailable.
        ValueError: Execution context or prepared inputs fail verification.
    """
    cipher = Fernet(os.environ["PLATFORM_HANDOFF_KEY"].encode())
    payload = json.loads(cipher.decrypt(_download(os.environ["PLATFORM_INPUT_URL"])))
    response = httpx.post(
        payload["claim_url"],
        headers={"Authorization": f"Bearer {payload['claim_token']}"},
        timeout=30,
    )
    response.raise_for_status()
    directory = Path("/work")
    if payload["phase"] == "inspect":
        result = _inspect(payload, directory)
        response = httpx.put(
            payload["result_output_url"],
            content=cipher.encrypt(json.dumps(result).encode()),
            timeout=120,
        )
        response.raise_for_status()
        sys.exit(result["exit_code"])
    if payload.get("context_url"):
        context = _download(payload["context_url"])
        if hashlib.sha256(context).hexdigest() != payload["context_digest"]:
            raise ValueError("Reviewed execution context digest changed")
        _extract(cipher.decrypt(context), directory)
    else:
        _checkout(payload, directory)
    started = time.time()
    exit_code = 1
    try:
        exit_code = _execute(payload, directory / "workspace")
    except (subprocess.TimeoutExpired, ValueError, OSError) as exc:
        print(f"Phase could not complete: {type(exc).__name__}", flush=True)
    result = _result(payload, directory / "workspace", exit_code)
    result["duration"] = time.time() - started
    response = httpx.put(
        payload["context_output_url"],
        content=cipher.encrypt(_archive(directory / "workspace")),
        timeout=120,
    )
    response.raise_for_status()
    response = httpx.put(
        payload["result_output_url"],
        content=cipher.encrypt(json.dumps(result).encode()),
        timeout=120,
    )
    response.raise_for_status()
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
