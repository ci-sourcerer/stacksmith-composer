import json
import time
from pathlib import Path
from uuid import uuid4

from .database import Database, row, runs
from .errors import ComposerError
from .scheduling import KubernetesDispatcher, requested_supervision


class InspectionQueue:
    """Submit server-selected inspection commands to the execution worker.

    Args:
        settings: Managed configuration and execution settings.
    """

    def __init__(self, settings):
        self.settings = settings
        self.database = Database(settings.database_url, settings.secret_key)
        self.dispatcher = (
            KubernetesDispatcher(settings, self.database)
            if settings.supervision_mode == "kubernetes-jobs"
            else None
        )

    def execute(self, args, source, github_token, authoring_request):
        """Wait for a bounded isolated inspection result.

        Args:
            args: Backend-selected Stacksmith inspection arguments.
            source: Current draft source, when applicable.
            github_token: Current user's GitHub credential.
            authoring_request: Optional document authoring request.

        Returns:
            Stacksmith JSON output.

        Raises:
            ComposerError: Inspection fails or exceeds its deadline.
        """
        identifier = uuid4().hex
        wait_timeout = (
            self.settings.inspection_wait_timeout or self.settings.command_timeout
        )
        with self.database.transaction() as connection:
            connection.execute(
                runs.insert().values(
                    id=identifier,
                    repository="inspection",
                    environment="inspection",
                    revision="0" * 40,
                    action="inspection",
                    actor="authoring",
                    status="queued",
                    phase=0,
                    supervision=requested_supervision(self.settings, "queued"),
                    spec={
                        "image": self.settings.execution_image,
                        "phases": ["inspect"],
                        "_inspection": self.database.encrypt(
                            json.dumps(
                                {
                                    "args": args,
                                    "source": source,
                                    "github_token": github_token,
                                    "authoring_request": authoring_request,
                                    "config": str(self.settings.config),
                                    "config_source": self.settings.config.read_text()
                                    if isinstance(self.settings.config, Path)
                                    else None,
                                }
                            )
                        ),
                    },
                    result={},
                    created=time.time(),
                    updated=time.time(),
                    expires=time.time() + wait_timeout,
                    dedup=identifier,
                    lock_key="",
                    fence=0,
                )
            )
        if self.dispatcher is not None:
            self.dispatcher.dispatch(identifier)
        deadline = time.monotonic() + wait_timeout
        while time.monotonic() < deadline:
            with self.database.transaction() as connection:
                run = row(connection, runs, identifier)
            if run["status"] == "succeeded":
                return self.database.decrypt(run["result"]["_inspection_output"])
            if run["status"] in {"failed", "expired", "cancelled", "uncertain"}:
                raise ComposerError(
                    "Stacksmith inspection failed. Review the draft and managed configuration.",
                    422,
                )
            time.sleep(0.2)
        with self.database.transaction() as connection:
            connection.execute(
                runs.update()
                .where(runs.c.id == identifier)
                .values(
                    status="cancelling",
                    supervision=requested_supervision(self.settings, "cancelling"),
                )
            )
        if self.dispatcher is not None:
            self.dispatcher.dispatch(identifier)
        raise ComposerError("Stacksmith inspection timed out.", 504)
