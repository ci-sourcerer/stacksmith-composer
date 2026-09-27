import shutil
import subprocess
from pathlib import Path

import pytest
from ruamel.yaml import YAML

pytestmark = pytest.mark.skipif(not shutil.which("helm"), reason="Helm CLI unavailable")


def _render(*options):
    return list(
        YAML(typ="safe").load_all(
            subprocess.run(
                [
                    "helm",
                    "template",
                    "test",
                    str(
                        Path(__file__).resolve().parents[1]
                        / "deploy/helm/stacksmith-platform"
                    ),
                    "--namespace",
                    "control",
                    *options,
                ],
                shell=False,
                check=True,
                capture_output=True,
                text=True,
            ).stdout
        )
    )


def test_chart_uses_temporary_supervisors_and_bounded_recovery():
    resources = _render()
    deployments = [item for item in resources if item["kind"] == "Deployment"]
    assert [item["metadata"]["name"] for item in deployments] == ["test-api"]
    api = deployments[0]["spec"]["template"]["spec"]
    assert api["automountServiceAccountToken"]
    for probe in ("readinessProbe", "livenessProbe"):
        assert api["containers"][0][probe]["httpGet"]["httpHeaders"] == [
            {"name": "Host", "value": "127.0.0.1"}
        ]
    cron = next(item for item in resources if item["kind"] == "CronJob")["spec"]
    assert cron["schedule"] == "* * * * *" and cron["concurrencyPolicy"] == "Forbid"
    assert cron["startingDeadlineSeconds"] == 50
    assert cron["jobTemplate"]["spec"]["activeDeadlineSeconds"] == 120
    assert cron["jobTemplate"]["spec"]["backoffLimit"] == 0
    recovery = cron["jobTemplate"]["spec"]["template"]["spec"]
    assert recovery["serviceAccountName"] == "test-supervisor"
    assert recovery["containers"][0]["command"] == ["stacksmith-platform-maintain"]
    assert (
        recovery["containers"][0]["envFrom"][1]["secretRef"]["name"]
        == "stacksmith-platform-supervisor-database"
    )
    assert (
        api["containers"][0]["envFrom"][1]["secretRef"]["name"]
        == "stacksmith-platform-api-database"
    )
    assert (
        next(
            item
            for item in resources
            if item["kind"] == "ServiceAccount"
            and item["metadata"]["name"] == "stacksmith-execution"
        )["automountServiceAccountToken"]
        is False
    )


def test_existing_accounts_and_dispatch_rbac_follow_overrides():
    resources = _render(
        "--set",
        "serviceAccounts.api.name=existing-api",
        "--set",
        "serviceAccounts.supervisor.name=existing-supervisor",
    )
    accounts = {
        item["metadata"]["name"]
        for item in resources
        if item["kind"] == "ServiceAccount"
    }
    assert accounts == {"stacksmith-execution"}
    dispatch = next(
        item
        for item in resources
        if item["kind"] == "RoleBinding" and item["metadata"]["name"] == "test-dispatch"
    )
    assert {subject["name"] for subject in dispatch["subjects"]} == {
        "existing-api",
        "existing-supervisor",
    }
    execution = next(
        item
        for item in resources
        if item["kind"] == "RoleBinding"
        and item["metadata"]["name"] == "test-supervisor"
    )
    assert execution["subjects"][0]["name"] == "existing-supervisor"
