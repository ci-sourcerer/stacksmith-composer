import json
import os
import shutil
import stat
import subprocess
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from dotenv import dotenv_values, set_key

from scripts import build_execution
from scripts.configure import check, configure

ROOT = Path(__file__).parents[1]


def _configured(path):
    configure(path, ROOT / ".env.example")
    pem = path.parent / "github.pem"
    pem.write_text("test-private-key")
    for key, value in {
        "STACKSMITH_PLATFORM_GITHUB_CLIENT_ID": "client-id",
        "STACKSMITH_PLATFORM_GITHUB_CLIENT_SECRET": "client-secret",
        "STACKSMITH_PLATFORM_GITHUB_APP_ID": "1",
        "STACKSMITH_PLATFORM_GITHUB_PRIVATE_KEY_FILE": str(pem),
        "STACKSMITH_PLATFORM_GITHUB_PRIVATE_KEY": "test-private-key",
        "STACKSMITH_PLATFORM_ADMIN_LOGINS": '["owner"]',
        "STACKSMITH_PLATFORM_CONFIG": "git+https://github.com/owner/config//config.yaml@"
        + "a" * 40,
        "STACKSMITH_PLATFORM_STACKSMITH_IMAGE": "registry/stacksmith:version",
        "STACKSMITH_PLATFORM_EXECUTION_IMAGE": "sha256:" + "b" * 64,
    }.items():
        set_key(path, key, value)
    return dotenv_values(path, interpolate=False)


def test_configure_migrates_auth_generates_secrets_and_preserves_local_values(tmp_path):
    path = tmp_path / ".env"
    path.write_text(
        "COMPOSER_GITHUB_CLIENT_ID=old-client\nCOMPOSER_GITHUB_CLIENT_SECRET=old-secret\nCOMPOSER_SECRET_KEY=stable-encryption-key\nCOMPOSER_PUBLIC_URL=http://127.0.0.1:5173\nLOCAL_EXTRA=preserved\n"
    )
    missing = configure(path, ROOT / ".env.example")
    values = dotenv_values(path, interpolate=False)
    assert values["STACKSMITH_PLATFORM_GITHUB_CLIENT_SECRET"] == "old-secret"
    assert values["STACKSMITH_PLATFORM_SECRET_KEY"] == "stable-encryption-key"
    assert values["STACKSMITH_PLATFORM_PUBLIC_URL"] == "http://localhost:8000"
    assert values["LOCAL_EXTRA"] == "preserved"
    assert not any(key.startswith("COMPOSER_") for key in values)
    assert len(values["STACKSMITH_PLATFORM_DB_PASSWORD"]) >= 32
    assert (
        values["STACKSMITH_PLATFORM_DB_PASSWORD"]
        != values["STACKSMITH_PLATFORM_API_DB_PASSWORD"]
    )
    assert "STACKSMITH_PLATFORM_GITHUB_APP_ID" in missing
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    original = path.read_text()
    configure(path, ROOT / ".env.example")
    assert path.read_text() == original


def test_configure_preserves_quoted_secrets_without_printing_them(
    tmp_path, monkeypatch, capsys
):
    monkeypatch.chdir(tmp_path)
    shutil.copyfile(ROOT / ".env.example", ".env.example")
    set_key(".env", "STACKSMITH_PLATFORM_GITHUB_CLIENT_SECRET", "secret'$value")
    from scripts.configure import main

    main()
    assert (
        dotenv_values(".env", interpolate=False)[
            "STACKSMITH_PLATFORM_GITHUB_CLIENT_SECRET"
        ]
        == "secret'$value"
    )
    assert "secret'$value" not in capsys.readouterr().out


def test_preflight_fails_with_field_names_before_building(
    tmp_path, monkeypatch, capsys
):
    monkeypatch.chdir(tmp_path)
    configure(Path(".env"), ROOT / ".env.example")
    with pytest.raises(SystemExit) as error:
        check()
    assert error.value.code == 1
    output = capsys.readouterr().out
    assert "STACKSMITH_PLATFORM_GITHUB_APP_ID" in output
    assert dotenv_values(".env")["STACKSMITH_PLATFORM_SECRET_KEY"] not in output


def test_preflight_accepts_complete_configuration_and_rejects_invalid_json(
    tmp_path, monkeypatch, capsys
):
    monkeypatch.chdir(tmp_path)
    _configured(Path(".env"))
    check()
    assert "ready" in capsys.readouterr().out
    set_key(".env", "STACKSMITH_PLATFORM_ADMIN_LOGINS", "invalid-json")
    with pytest.raises(SystemExit):
        check()
    assert "valid JSON" in capsys.readouterr().out


def test_execution_build_uses_fresh_wheel_context_and_saves_immutable_id(
    tmp_path, monkeypatch
):
    monkeypatch.chdir(tmp_path)
    _configured(Path(".env"))
    runner = MagicMock(
        side_effect=[
            SimpleNamespace(),
            SimpleNamespace(),
            SimpleNamespace(stdout="sha256:" + "c" * 64 + "\n"),
        ]
    )
    monkeypatch.setattr(build_execution.subprocess, "run", runner)
    build_execution.main()
    calls = runner.call_args_list
    assert calls[0].args[0][:3] == ["uv", "build", "--wheel"]
    assert calls[1].args[0][:4] == [
        "docker",
        "build",
        "-f",
        "deploy/Dockerfile.execution",
    ]
    assert "--build-context" in calls[1].args[0]
    assert all(call.kwargs["shell"] is False for call in calls)
    assert not Path(calls[0].args[0][-1]).exists()
    assert (
        dotenv_values(".env")["STACKSMITH_PLATFORM_EXECUTION_IMAGE"]
        == "sha256:" + "c" * 64
    )


def test_prebuilt_execution_image_does_not_trigger_a_build(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    _configured(Path(".env"))
    set_key(".env", "STACKSMITH_PLATFORM_STACKSMITH_IMAGE", "")
    runner = MagicMock()
    monkeypatch.setattr(build_execution.subprocess, "run", runner)
    build_execution.main()
    runner.assert_not_called()


@pytest.mark.skipif(
    not shutil.which("docker"), reason="Docker Compose CLI is unavailable"
)
def test_compose_uses_one_env_and_separates_database_credentials(tmp_path):
    values = _configured(tmp_path / ".env")
    set_key(tmp_path / ".env", "UNRELATED_SECRET", "must-not-be-injected")
    result = subprocess.run(
        [
            "docker",
            "compose",
            "--env-file",
            str(tmp_path / ".env"),
            "-f",
            str(ROOT / "compose.yaml"),
            "config",
            "--format",
            "json",
        ],
        shell=False,
        check=True,
        capture_output=True,
        text=True,
        env={
            key: value
            for key, value in os.environ.items()
            if not key.startswith("STACKSMITH_PLATFORM_")
        },
    )
    config = json.loads(result.stdout)
    assert config["services"]["postgres"]["image"] == "postgres:18-alpine"
    assert any(
        mount["target"] == "/var/lib/postgresql"
        for mount in config["services"]["postgres"]["volumes"]
    )
    api = config["services"]["api"]["environment"]
    worker = config["services"]["worker"]["environment"]
    assert values["STACKSMITH_PLATFORM_DB_PASSWORD"] not in json.dumps(api)
    assert values["STACKSMITH_PLATFORM_WORKER_DB_PASSWORD"] not in json.dumps(api)
    assert values["STACKSMITH_PLATFORM_API_DB_PASSWORD"] not in json.dumps(worker)
    assert "must-not-be-injected" not in json.dumps(config)
    assert (
        config["services"]["storage-backend"]["environment"]["AWS_SECRET_ACCESS_KEY"]
        == api["STACKSMITH_PLATFORM_ARTIFACT_SECRET_KEY"]
    )
    assert json.loads(api["STACKSMITH_PLATFORM_SECRET_REFERENCES"]) == {}
    assert set(config["services"]["storage-backend"]["networks"]) == {
        "artifact-backend"
    }
    assert config["networks"]["artifact-backend"]["internal"]
    assert "artifact-backend" not in config["services"]["api"]["networks"]
    assert "ports" not in config["services"]["storage"]
    assert api["STACKSMITH_PLATFORM_GITHUB_PRIVATE_KEY"]
    assert "STACKSMITH_PLATFORM_GITHUB_PRIVATE_KEY_FILE" not in api


def test_compose_commands_reload_env_written_by_earlier_tasks(tmp_path, monkeypatch):
    from scripts import compose

    monkeypatch.chdir(tmp_path)
    _configured(Path(".env"))
    monkeypatch.setenv(
        "STACKSMITH_PLATFORM_EXECUTION_IMAGE", "stale-image-from-task-start"
    )
    set_key(".env", "STACKSMITH_PLATFORM_EXECUTION_IMAGE", "sha256:" + "d" * 64)
    runner = MagicMock()
    monkeypatch.setattr(compose.subprocess, "run", runner)
    compose.start()
    assert "STACKSMITH_PLATFORM_EXECUTION_IMAGE" not in runner.call_args.kwargs["env"]
    assert (
        dotenv_values(".env")["STACKSMITH_PLATFORM_EXECUTION_IMAGE"]
        == "sha256:" + "d" * 64
    )
    assert runner.call_args.args[0] == ["docker", "compose", "up", "--detach", "--wait"]
    compose.down()
    assert "--volumes" not in runner.call_args.args[0]
