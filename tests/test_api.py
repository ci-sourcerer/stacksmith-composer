from copy import deepcopy


def _draft(client):
    snapshot = client.get("/api/sample").json()
    return {
        "snapshot": snapshot["snapshot"],
        "components": snapshot["document"]["components"],
    }


def test_sample_and_review_preserve_exact_original(client):
    assert client.get("/api/health").json() == {"status": "ok"}
    sample = client.get("/api/sample").json()
    response = client.post(
        "/api/review",
        json={
            "snapshot": sample["snapshot"],
            "components": sample["document"]["components"],
        },
    )
    assert response.status_code == 200
    assert response.json()["source"] == sample["source"]
    assert response.json()["diff"] == ""


def test_review_returns_authored_diff(client):
    draft = _draft(client)
    draft["components"]["api"]["properties"]["name"] = "new-service"
    response = client.post("/api/review", json=draft)
    assert response.status_code == 200
    assert "+      name: new-service" in response.json()["diff"]


def test_snapshot_tampering_is_rejected(client):
    draft = _draft(client)
    draft["snapshot"] += "tampered"
    assert client.post("/api/review", json=draft).status_code == 409


def test_config_change_requires_reopening(client, tmp_path):
    draft = _draft(client)
    client.app.state.settings.config = tmp_path / "new-config.yaml"
    client.app.state.settings.config.write_text("description: changed\n")
    assert client.post("/api/review", json=draft).status_code == 409


def test_cross_origin_mutation_is_rejected(client):
    assert (
        client.post(
            "/api/review",
            json=_draft(client),
            headers={"Origin": "https://attacker.invalid"},
        ).status_code
        == 403
    )


def test_missing_csrf_header_is_rejected(client):
    draft = _draft(client)
    client.headers.pop("X-Composer-Request")
    assert client.post("/api/review", json=draft).status_code == 403


def test_demo_never_creates_a_pull_request(client):
    assert client.post("/api/pull-requests", json=_draft(client)).status_code == 503


def test_github_mode_requires_authentication_for_metadata(client):
    client.app.state.settings.github_client_id = "configured"
    for path in ("/api/catalog", "/api/platform", "/api/sample", "/api/repositories"):
        assert client.get(path).status_code == 401


def test_read_only_source_still_opens(client, tmp_path):
    client.app.state.settings.sample = tmp_path / "stack.yaml"
    client.app.state.settings.sample.write_text(
        "name: generated\n{% for x in [] %}{% endfor %}"
    )
    response = client.get("/api/sample")
    assert response.status_code == 200
    assert not response.json()["editable"]
    assert "whole-file Jinja" in response.json()["reason"]


def test_platform_view_does_not_expose_backend_values_or_hook_source(client, tmp_path):
    client.app.state.settings.config = tmp_path / "platform.yaml"
    client.app.state.settings.config.write_text("""
backend:
  data:
    type: s3
    secret_key: do-not-expose
var_validations:
  environment:
    description: Validate environment
    inline: secret-hook-source
""")
    response = client.get("/api/platform")
    assert response.status_code == 200
    assert "do-not-expose" not in response.text
    assert "secret-hook-source" not in response.text
    assert "Validate environment" in response.text


def test_unknown_component_type_blocks_review(client):
    draft = deepcopy(_draft(client))
    draft["components"]["api"]["type"] = "not-catalogued"
    assert client.post("/api/review", json=draft).status_code == 422


def test_oauth_state_is_required(client):
    assert client.get("/api/auth/callback?code=example&state=bad").status_code == 401


def test_platform_tool_metadata_does_not_expose_additional_fields(client, tmp_path):
    client.app.state.settings.config = tmp_path / "platform.yaml"
    client.app.state.settings.config.write_text("""
backend:
  data:
    type: local
tools:
  tofu:
    version: 1.0.0
    private_token: secret-tool-value
""")
    response = client.get("/api/platform")
    assert response.status_code == 200
    assert response.json()["tools"] == {"tofu": {"version": "1.0.0"}}
    assert "secret-tool-value" not in response.text
