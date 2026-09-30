import json
import subprocess
from pathlib import Path
from unittest.mock import patch

import pytest

from stacksmith_composer.adapter import StacksmithAdapter
from stacksmith_composer.errors import ComposerError
from stacksmith_composer.settings import Settings


def test_command_is_explicit_and_only_session_github_credential_is_forwarded(
    tmp_path, monkeypatch
):
    monkeypatch.setenv("COMPOSER_GITHUB_CLIENT_SECRET", "must-not-leak")
    monkeypatch.setenv("GITHUB_TOKEN", "must-not-leak")
    monkeypatch.setenv("STACKSMITH_RUN_FILE", "untrusted-runfile")
    adapter = StacksmithAdapter(
        Settings(
            _env_file=None, github_client_secret="", config=tmp_path / "trusted.yaml"
        )
    )
    adapter.command = "/example/bin/stacksmith"
    with patch(
        "subprocess.run",
        return_value=subprocess.CompletedProcess([], 0, json.dumps({"rules": []}), ""),
    ) as run:
        assert adapter.associations("name: demo\ncomponents: {}", "session-token") == {
            "rules": []
        }
    assert run.call_args.kwargs["shell"] is False
    assert "GITHUB_TOKEN" not in run.call_args.kwargs["env"]
    assert "COMPOSER_GITHUB_CLIENT_SECRET" not in run.call_args.kwargs["env"]
    assert "STACKSMITH_RUN_FILE" not in run.call_args.kwargs["env"]
    assert run.call_args.kwargs["env"]["STACKSMITH_GIT_TOKEN"] == "session-token"
    assert not Path(run.call_args.kwargs["cwd"]).exists()


def test_timeout_has_a_public_recovery_message(tmp_path):
    adapter = StacksmithAdapter(
        Settings(_env_file=None, config=tmp_path / "trusted.yaml")
    )
    adapter.command = "/example/bin/stacksmith"
    with (
        patch(
            "subprocess.run", side_effect=subprocess.TimeoutExpired("stacksmith", 30)
        ),
        pytest.raises(ComposerError, match="timed out"),
    ):
        adapter.catalog()


def test_cli_stderr_is_not_exposed(tmp_path):
    adapter = StacksmithAdapter(
        Settings(_env_file=None, config=tmp_path / "trusted.yaml")
    )
    adapter.command = "/example/bin/stacksmith"
    with (
        patch(
            "subprocess.run",
            return_value=subprocess.CompletedProcess([], 1, "", "secret-value"),
        ),
        pytest.raises(ComposerError) as error,
    ):
        adapter.catalog()
    assert "secret-value" not in str(error.value)


def test_catalog_removes_configured_module_source_prefix(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("COMPOSER_MODULE_SOURCE_PREFIX", str(tmp_path))
    adapter = StacksmithAdapter(
        Settings(_env_file=None, config=tmp_path / "trusted.yaml")
    )
    with patch.object(
        adapter,
        "_json",
        return_value={
            "service": {
                "module_source": str(tmp_path / "modules" / "service"),
                "module_version": "local",
            },
            "remote": {
                "module_source": "https://github.com/example/modules.git//service",
                "module_version": "v1.2.3",
            },
        },
    ):
        assert adapter.catalog() == {
            "service": {
                "module_path": "modules/service",
                "module_source": "modules/service",
                "module_version": "local",
            },
            "remote": {
                "module_source": "https://github.com/example/modules.git//service",
                "module_source_url": (
                    "https://github.com/example/modules/tree/v1.2.3/service"
                ),
                "module_version": "v1.2.3",
            },
        }


@pytest.mark.parametrize(
    ("module_source", "module_version", "expected"),
    [
        (
            "https://github.com/example/modules.git//service",
            None,
            "https://github.com/example/modules/tree/HEAD/service",
        ),
        (
            "https://github.com/example/modules.git//service",
            "v1.2.3",
            "https://github.com/example/modules/tree/v1.2.3/service",
        ),
        (
            "https://github.com/example/modules.git//service?ref=main",
            "v1.2.3",
            "https://github.com/example/modules/tree/main/service",
        ),
    ],
)
def test_catalog_module_source_url_includes_module_path_without_query_ref(
    tmp_path, module_source, module_version, expected
):
    adapter = StacksmithAdapter(
        Settings(_env_file=None, config=tmp_path / "trusted.yaml")
    )
    with patch.object(
        adapter,
        "_json",
        return_value={
            "remote": {
                "module_source": module_source,
                "module_version": module_version,
            }
        },
    ):
        assert adapter.catalog()["remote"]["module_source_url"] == expected
