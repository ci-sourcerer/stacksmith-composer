import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from stacksmith_composer.adapter import StacksmithAdapter
from stacksmith_composer.app import create_app
from stacksmith_composer.settings import Settings


@pytest.mark.skipif(
    not os.environ.get("STACKSMITH_TEST_COMMAND"),
    reason="Set STACKSMITH_TEST_COMMAND to run the real CLI integration test",
)
def test_real_cli_resolution_explains_defaults_transforms_and_renames(tmp_path):
    (tmp_path / "config.yaml").write_text("""backend:
  data:
    type: local
    path: .state
module_mappings:
  service:
    source:
      source: git
      data:
        repo: https://example.com/modules.git
        ref: v1
    properties:
      size:
        mapped_to: machine_size
        transform:
          jinja: '{{ property.value | upper }}'
      region:
        default: private-region
""")
    adapter = StacksmithAdapter(
        Settings(
            _env_file=None,
            stacksmith_command=os.environ["STACKSMITH_TEST_COMMAND"],
            config=tmp_path / "config.yaml",
            stacksmith_build_dir=tmp_path / "build",
        )
    )
    source = "name: demo\ncomponents:\n  api:\n    type: service\n    properties:\n      size: private-size\n"
    result = adapter.resolution(source)
    assert result["effective"]["components"]["api"]["properties"] == {
        "machine_size": "[REDACTED]",
        "region": "[REDACTED]",
    }
    assert {event["action"] for event in result["events"]} >= {
        "managed default",
        "transform",
        "rename",
        "resolved",
    }
    assert "private-size" not in str(result)
    assert "private-region" not in str(result)
    assert any(event["source"] == "Current draft" for event in result["events"])
    assert "stacksmith-composer-" not in str(result)
    queried = adapter.resolution(source, query="components.api.properties.machine_size")
    assert queried["value"] == "[REDACTED]"
    assert any(event["action"] == "rename" for event in queried["events"])
    assert not list(tmp_path.rglob("*.tf.json"))


@pytest.mark.skipif(
    not os.environ.get("STACKSMITH_TEST_COMMAND"),
    reason="Set STACKSMITH_TEST_COMMAND to run the real CLI integration test",
)
def test_real_cli_resolves_edges_and_opt_out_without_changing_authored_source(tmp_path):
    app = create_app(
        Settings(
            _env_file=None,
            stacksmith_command=os.environ["STACKSMITH_TEST_COMMAND"],
            config=Path(__file__).parent.parent / "examples/platform.yaml",
            sample=Path(__file__).parent.parent / "examples/stack.yaml",
            database=tmp_path / "sessions.sqlite3",
        )
    )
    with TestClient(app, headers={"X-Composer-Request": "1"}) as client:
        snapshot = client.get("/api/sample").json()
        draft = {
            "snapshot": snapshot["snapshot"],
            "components": snapshot["document"]["components"],
        }
        reviewed = client.post("/api/review", json=draft)
        assert reviewed.status_code == 200, reviewed.text
        assert [edge["kind"] for edge in reviewed.json()["edges"]].count(
            "association"
        ) == 2
        assert [edge["kind"] for edge in reviewed.json()["edges"]].count(
            "reference"
        ) == 1
        assert reviewed.json()["diff"] == ""
        draft["disabled_associations"] = [
            "lambda-execution-role",
            "role-baseline-policies",
        ]
        opted_out = client.post("/api/review", json=draft)
        assert opted_out.status_code == 200, opted_out.text
        assert len(opted_out.json()["edges"]) == 1
        assert "disabled_associations" in opted_out.json()["diff"]
        assert "role_arn" not in opted_out.json()["source"]
