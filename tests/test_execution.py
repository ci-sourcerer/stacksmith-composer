import io
import json
import tarfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from stacksmith_platform.drivers import DockerDriver, KubernetesDriver
from stacksmith_platform.execution import (
    _archive,
    _environment,
    _execute,
    _extract,
    _prepare,
)


def test_docker_execution_has_no_control_plane_access(monkeypatch):
    runtime = MagicMock()
    monkeypatch.setattr("stacksmith_platform.drivers.docker.from_env", lambda: runtime)
    driver = DockerDriver(
        SimpleNamespace(
            docker_network="isolated", docker_memory="2g", execution_cpu="1"
        )
    )
    driver.launch(
        "phase", "image@sha256:digest", {"PLATFORM_INPUT_URL": "single-object"}, 3600
    )
    options = runtime.containers.run.call_args.kwargs
    assert options["read_only"] and options["cap_drop"] == ["ALL"]
    assert options["network"] == "isolated" and options["user"] == "10001:10001"
    assert "volumes" not in options
    for mount in ("/tmp", "/work"):
        assert {"exec", "nosuid", "nodev"} <= set(options["tmpfs"][mount].split(","))
    assert options["environment"] == {"PLATFORM_INPUT_URL": "single-object"}
    assert options["entrypoint"] == ["stacksmith-platform-execute"]
    assert options["log_config"]["Config"]["max-size"] == "1m"


def test_kubernetes_execution_is_non_retrying_and_has_no_api_credentials(monkeypatch):
    monkeypatch.setattr(
        "stacksmith_platform.drivers.config.load_incluster_config", lambda: None
    )
    batch = MagicMock()
    monkeypatch.setattr("stacksmith_platform.drivers.client.BatchV1Api", lambda: batch)
    monkeypatch.setattr("stacksmith_platform.drivers.client.CoreV1Api", MagicMock)
    driver = KubernetesDriver(
        SimpleNamespace(
            execution_namespace="runs",
            execution_service_account="execution",
            execution_cpu="1",
            execution_memory="2Gi",
            allow_local_execution_image=False,
        )
    )
    driver.launch(
        "phase", "image@sha256:digest", {"PLATFORM_INPUT_URL": "single-object"}, 3600
    )
    namespace, job = batch.create_namespaced_job.call_args.args
    assert namespace == "runs"
    assert (
        job["spec"]["backoffLimit"] == 0
        and job["spec"]["activeDeadlineSeconds"] == 3600
    )
    pod = job["spec"]["template"]["spec"]
    assert not pod["automountServiceAccountToken"]
    assert pod["restartPolicy"] == "Never"
    assert pod["serviceAccountName"] == "execution"
    assert pod["containers"][0]["securityContext"]["readOnlyRootFilesystem"]
    assert all("emptyDir" in volume for volume in pod["volumes"])


def test_archive_rejects_paths_outside_workspace(tmp_path):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode="w:gz") as archive:
        member = tarfile.TarInfo("../../escape")
        member.size = 4
        archive.addfile(member, io.BytesIO(b"data"))
    with pytest.raises(tarfile.OutsideDestinationError):
        _extract(output.getvalue(), tmp_path)


def test_archive_materializes_external_provider_cache(tmp_path, monkeypatch):
    cache = tmp_path / "provider-cache"
    cache.mkdir()
    (cache / "provider").write_bytes(b"provider binary")
    (cache / "provider").chmod(0o755)
    monkeypatch.setattr("stacksmith_platform.execution.PROVIDER_CACHE", cache)
    workspace = tmp_path / "source"
    workspace.mkdir()
    (workspace / "providers").symlink_to(cache, target_is_directory=True)

    _extract(_archive(workspace), tmp_path / "restored")
    cache.rename(tmp_path / "removed-cache")

    restored = tmp_path / "restored/workspace/providers"
    assert not restored.is_symlink()
    assert (restored / "provider").read_bytes() == b"provider binary"
    assert (restored / "provider").stat().st_mode & 0o111


def test_archive_makes_internal_absolute_links_portable(tmp_path):
    workspace = tmp_path / "source"
    workspace.mkdir()
    (workspace / "target").write_text("workspace content")
    (workspace / "link").symlink_to(workspace / "target")

    _extract(_archive(workspace), tmp_path / "restored")
    workspace.rename(tmp_path / "removed-source")

    restored = tmp_path / "restored/workspace/link"
    assert restored.is_symlink()
    assert not restored.readlink().is_absolute()
    assert restored.read_text() == "workspace content"


def test_archive_rejects_external_links_outside_provider_cache(tmp_path):
    (tmp_path / "outside").write_text("not part of the workspace")
    workspace = tmp_path / "source"
    workspace.mkdir()
    (workspace / "link").symlink_to(tmp_path / "outside")

    with pytest.raises(ValueError, match="outside the execution context"):
        _archive(workspace)


def test_workspace_round_trip_preserves_generated_plan(tmp_path):
    workspace = tmp_path / "original"
    workspace.mkdir()
    (workspace / "reviewed.tfplan").write_bytes(b"binary plan")
    _extract(_archive(workspace), tmp_path / "restored")
    assert (
        tmp_path / "restored/workspace/reviewed.tfplan"
    ).read_bytes() == b"binary plan"


def test_subprocess_environment_does_not_inherit_supervisor_secrets(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sensitive")
    monkeypatch.setenv("STACKSMITH_PLATFORM_SECRET_KEY", "sensitive")
    environment = _environment(
        {
            "github_token": "git-token",
            "credentials": {"AWS_SESSION_TOKEN": "phase-token"},
        }
    )
    assert (
        "DATABASE_URL" not in environment
        and "STACKSMITH_PLATFORM_SECRET_KEY" not in environment
    )
    assert environment["AWS_SESSION_TOKEN"] == "phase-token"
    assert environment["STACKSMITH_GIT_TOKEN"] == "git-token"
    assert environment["FORCE_COLOR"] == "1"
    assert environment["TERM"] == "xterm-256color"
    assert environment["STACKSMITH_CI_SUMMARY_FORMAT"] == "none"
    assert "NO_COLOR" not in environment
    assert "STACKSMITH_CI_SKIP_BACKEND_VALIDATION" not in environment


@pytest.mark.parametrize("action", ["plan", "plan-operation"])
def test_local_backend_bypass_is_explicit_and_plan_only(action):
    assert (
        _environment(
            {
                "github_token": "token",
                "credentials": {},
                "action": action,
                "allow_local_backend": True,
            }
        )["STACKSMITH_CI_SKIP_BACKEND_VALIDATION"]
        == "1"
    )


@pytest.mark.parametrize("action", ["apply", "destroy", "apply-operation"])
def test_execution_rejects_mutating_local_backend_overrides(action):
    with pytest.raises(ValueError, match="test plans"):
        _environment(
            {
                "github_token": "token",
                "credentials": {},
                "action": action,
                "allow_local_backend": True,
            }
        )


@pytest.mark.parametrize(("target", "mode"), [("dev", "auto"), ("default", "single")])
def test_prepare_uses_stacksmith_contract_and_disables_implicit_env_file(
    tmp_path, monkeypatch, target, mode
):
    calls = []
    monkeypatch.setattr(
        "stacksmith_platform.execution.subprocess.run",
        lambda args, **kwargs: (
            calls.append((args, kwargs))
            or SimpleNamespace(
                returncode=0,
                stdout=json.dumps(
                    {"version": 2, "matrix": [{"environment": target}]}
                ).encode(),
            )
        ),
    )
    assert (
        _prepare(
            {
                "action": "apply",
                "config": "approved-config",
                "settings": {
                    "gitops_root": ".",
                    "discovery_mode": mode,
                    "locked": True,
                },
                "environment": target,
                "event": "push",
                "default_branch": "main",
                "revision": "a" * 40,
                "operations": [],
                "timeout": 3600,
            },
            tmp_path,
            {},
        )
        == 0
    )
    args, options = calls[0]
    assert args[:3] == ["stacksmith", "ci", "prepare"]
    assert args[args.index("--env-file") + 1] == "/dev/null"
    assert args[args.index("--discovery-mode") + 1] == mode
    assert args[args.index("--environments") + 1] == target
    assert "--locked" in args and options["shell"] is False
    assert (tmp_path / ".platform-manifest.json").is_file()


def test_apply_rejects_changed_manifest_before_invocation(tmp_path, monkeypatch):
    calls = MagicMock()
    monkeypatch.setattr("stacksmith_platform.execution.subprocess.run", calls)
    monkeypatch.setattr(Path, "mkdir", lambda *args, **kwargs: None)
    (tmp_path / ".platform-manifest.json").write_text("changed")
    with pytest.raises(ValueError, match="manifest digest"):
        _execute(
            {
                "github_token": "git-token",
                "credentials": {},
                "phase": "apply",
                "manifest_digest": "reviewed-digest",
            },
            tmp_path,
        )
    calls.assert_not_called()
