import base64
import json

from scripts.kubernetes import _resources


def test_local_stack_provisions_database_secrets_and_multiline_configuration(
    monkeypatch,
):
    monkeypatch.setenv("STACKSMITH_RUN_CUSTOM_VALUE", "from-shell")
    resources = _resources(
        {
            "STACKSMITH_PLATFORM_DB_PASSWORD": "admin/secret",
            "STACKSMITH_PLATFORM_API_DB_PASSWORD": "api/secret",
            "STACKSMITH_PLATFORM_WORKER_DB_PASSWORD": "worker/secret",
            "STACKSMITH_PLATFORM_ARTIFACT_ACCESS_KEY": "artifact-key",
            "STACKSMITH_PLATFORM_ARTIFACT_SECRET_KEY": "artifact-secret",
            "STACKSMITH_PLATFORM_GITHUB_PRIVATE_KEY": "first\nsecond\n",
            "STACKSMITH_PLATFORM_RUN_ENVIRONMENT": '{"EXISTING":"kept"}',
        },
        {
            "AWS_ACCESS_KEY_ID": "aws-key",
            "AWS_SECRET_ACCESS_KEY": "aws-secret",
        },
    )
    database = next(
        resource
        for resource in resources
        if resource["metadata"].get("name") == "stacksmith-postgres"
    )
    postgres_container = database["spec"]["template"]["spec"]["containers"][0]
    assert postgres_container["image"] == "postgres:18-alpine"
    data_mount = next(
        mount for mount in postgres_container["volumeMounts"] if mount["name"] == "data"
    )
    assert data_mount["mountPath"] == "/var/lib/postgresql"
    secrets = {
        resource["metadata"]["name"]: {
            key: base64.b64decode(value).decode()
            for key, value in resource["data"].items()
        }
        for resource in resources
        if resource["kind"] == "Secret"
    }
    assert (
        secrets["stacksmith-platform-config"]["STACKSMITH_PLATFORM_GITHUB_PRIVATE_KEY"]
        == "first\nsecond\n"
    )
    assert json.loads(
        secrets["stacksmith-platform-config"]["STACKSMITH_PLATFORM_RUN_ENVIRONMENT"]
    ) == {
        "EXISTING": "kept",
        "CUSTOM_VALUE": "from-shell",
        "AWS_ACCESS_KEY_ID": "aws-key",
        "AWS_SECRET_ACCESS_KEY": "aws-secret",
    }
    assert {name for name in secrets if name.endswith("-database")} == {
        "stacksmith-platform-api-database",
        "stacksmith-platform-supervisor-database",
        "stacksmith-platform-migration-database",
    }
    assert (
        "api%2Fsecret"
        in secrets["stacksmith-platform-api-database"][
            "STACKSMITH_PLATFORM_DATABASE_URL"
        ]
    )
