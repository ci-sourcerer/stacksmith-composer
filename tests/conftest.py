from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from stacksmith_composer.app import create_app
from stacksmith_composer.settings import Settings

EXAMPLES = Path(__file__).parent.parent / "examples"
CATALOG = {
    "aws_lambda_function": {
        "inputs": [{"name": "function_name"}, {"name": "role_arn"}],
        "outputs": [{"name": "arn"}, {"name": "function_name"}],
    },
    "aws_iam_role": {
        "inputs": [{"name": "role_name"}, {"name": "policy_arns"}],
        "outputs": [{"name": "arn"}, {"name": "name"}],
    },
    "aws_iam_policy": {
        "inputs": [{"name": "name"}, {"name": "policy_statements"}],
        "outputs": [{"name": "arn"}],
    },
    "aws_managed_policy": {
        "inputs": [{"name": "policy_arn"}],
        "outputs": [{"name": "arn"}],
    },
}


class FakeAdapter:
    """Replace CLI calls in HTTP contract tests."""

    def catalog(self, github_token=None):
        """Return test component interfaces."""
        return CATALOG

    def associations(self, source, github_token=None):
        """Return an empty association result for a provided stack source."""
        return {"rules": [], "applications": []}

    def resolution(self, source, github_token=None, query=None):
        """Return an empty redacted resolution response.

        Args:
            source: Current authored stack source.
            github_token: Session credential for private sources.
            query: Optional configuration address.

        Returns:
            An empty resolution history with redacted effective data.
        """
        return {"effective": {}, "events": []}


@pytest.fixture
def client(tmp_path):
    app = create_app(
        Settings(
            _env_file=None,
            config=EXAMPLES / "platform.yaml",
            sample=EXAMPLES / "stack.yaml",
            database=tmp_path / "sessions.sqlite3",
            secret_key="test-secret-key-with-at-least-32-characters",
        )
    )
    app.state.adapter = FakeAdapter()
    with TestClient(app, headers={"X-Composer-Request": "1"}) as client:
        yield client
