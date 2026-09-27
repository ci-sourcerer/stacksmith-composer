from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from stacksmith_composer.app import create_app
from stacksmith_composer.settings import Settings

EXAMPLES = Path(__file__).parent.parent / "examples"
CATALOG = {
    "network": {"inputs": [{"name": "cidr"}], "outputs": [{"name": "id"}]},
    "database": {"inputs": [{"name": "name"}], "outputs": [{"name": "endpoint"}]},
    "service": {"inputs": [{"name": "database_url"}], "outputs": [{"name": "url"}]},
}


class FakeAdapter:
    """Replace CLI calls in HTTP contract tests."""

    def catalog(self):
        """Return test component interfaces."""
        return CATALOG

    def associations(self, source):
        """Return an empty association result for a provided stack source."""
        return {"rules": [], "applications": []}


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
