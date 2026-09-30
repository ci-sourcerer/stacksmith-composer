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
    draft["components"]["request_reader"]["properties"]["function_name"] = (
        "new-function"
    )
    response = client.post("/api/review", json=draft)
    assert response.status_code == 200
    assert "+      function_name: new-function" in response.json()["diff"]


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


def test_platform_view_exposes_sources_and_hides_backend_values(client, tmp_path):
    client.app.state.settings.config = tmp_path / "platform.yaml"
    (tmp_path / "validate.py").write_text("def validate(value): return 'pass'\n")
    client.app.state.settings.config.write_text("""
backend:
  data:
    type: s3
    secret_key: do-not-expose
var_validations:
  environment:
    description: Validate environment
    inline: secret-hook-source
plan_validations:
  local_script:
    description: Local source preview
    rule:
      script:
        source: local
        data:
          path: validate.py
  approved_plan:
    description: Validate the generated plan
    rule:
      script:
        source: git
        data:
          repo: https://github.com/example/platform.git
          path: policies/plan.py
          ref: abc123
provider_mappings:
  aws:
    source:
      source: registry
      data:
        address: hashicorp/aws
        version: "= 6.39.0"
    instances:
        default:
          description: Primary account
          config:
            data:
              region: us-east-1
              session_token: do-not-expose
module_mappings:
  service:
    description: Example service
    source:
      source: git
      data:
        repo: https://github.com/example/modules.git
        path: service
        ref: abc123
    properties:
      name:
        description: Service name
    outputs:
      arn:
        description: Service ARN
tools:
  tofu:
    version: 1.8.0
    binary: tofu
    api_token: do-not-expose
associations:
  execution_role:
    description: Attach the managed role.
    producers:
      select: component_type == 'role'
    consumers:
      select: component_type == 'function'
    bindings:
      - output: arn
        property: role_arn
    password: do-not-expose
""")
    response = client.get("/api/platform")
    assert response.status_code == 200
    assert "do-not-expose" not in response.text
    assert response.json()["backend"]["source"]["configuration"] == {
        "type": "s3",
        "secret_key": "[redacted]",
    }
    assert response.json()["tools"]["tofu"]["source"]["configuration"] == {
        "version": "1.8.0",
        "binary": "tofu",
        "api_token": "[redacted]",
    }
    assert response.json()["associations"][0]["source"]["configuration"][
        "bindings"
    ] == [{"output": "arn", "property": "role_arn"}]
    assert (
        response.json()["associations"][0]["source"]["configuration"]["password"]
        == "[redacted]"
    )
    assert "secret-hook-source" in response.text
    assert "def validate(value): return 'pass'" in response.text
    assert "Validate environment" in response.text
    assert response.json()["policies"][0]["source"]["label"] == "Inline Python"
    assert response.json()["policies"][2]["source"]["url"].endswith(
        "/example/platform/tree/abc123/policies/plan.py"
    )
    assert response.json()["providers"][0]["source"]["url"].endswith(
        "/provider/hashicorp/aws/v6.39.0"
    )
    assert (
        response.json()["providers"][0]["instances"][0]["source"]["label"]
        == "Static configuration data"
    )
    assert response.json()["providers"][0]["instances"][0]["source"][
        "configuration"
    ] == {"region": "us-east-1", "session_token": "[redacted]"}
    assert response.json()["components"][0]["source"]["url"].endswith(
        "/example/modules/tree/abc123/service"
    )


def test_unknown_component_type_blocks_review(client):
    draft = deepcopy(_draft(client))
    draft["components"]["request_reader"]["type"] = "not-catalogued"
    assert client.post("/api/review", json=draft).status_code == 422


def test_oauth_state_is_required(client):
    assert client.get("/api/auth/callback?code=example&state=bad").status_code == 401


def test_platform_tool_metadata_exposes_sanitized_configuration(client, tmp_path):
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
    assert response.json()["tools"] == {
        "tofu": {
            "version": "1.0.0",
            "source": {
                "kind": "data",
                "label": "Managed tool configuration",
                "detail": None,
                "url": None,
                "configuration": {
                    "version": "1.0.0",
                    "private_token": "[redacted]",
                },
            },
        }
    }
    assert "secret-tool-value" not in response.text
