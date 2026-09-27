import json
import subprocess
from pathlib import Path
from unittest.mock import patch

import pytest

from stacksmith_composer.adapter import StacksmithAdapter
from stacksmith_composer.errors import ComposerError
from stacksmith_composer.settings import Settings


def test_command_is_explicit_and_github_credentials_are_not_inherited(
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
        assert adapter.associations("name: demo\ncomponents: {}") == {"rules": []}
    assert run.call_args.kwargs["shell"] is False
    assert "GITHUB_TOKEN" not in run.call_args.kwargs["env"]
    assert "COMPOSER_GITHUB_CLIENT_SECRET" not in run.call_args.kwargs["env"]
    assert "STACKSMITH_RUN_FILE" not in run.call_args.kwargs["env"]
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
