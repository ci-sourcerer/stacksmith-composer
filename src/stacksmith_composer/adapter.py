import json
import os
import shutil
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import BoundedSemaphore
from typing import Any

from .errors import ComposerError
from .settings import Settings


class StacksmithAdapter:
    """Call a separate Stacksmith CLI without importing its package.

    Args:
        settings: Administrator-owned command and managed configuration settings.
    """

    def __init__(self, settings: Settings):
        self.settings = settings
        self.slots = BoundedSemaphore(2)
        self.command = shutil.which(settings.stacksmith_command)
        if self.command:
            self.command = str(Path(self.command).resolve())

    def _run(self, args: list[str], source: str | None = None) -> str:
        if not self.slots.acquire(timeout=1):
            raise ComposerError(
                "Stacksmith is busy inspecting another draft. Retry shortly.", 503
            )
        try:
            return self._execute(args, source)
        finally:
            self.slots.release()

    def _execute(self, args: list[str], source: str | None = None) -> str:
        if not self.command:
            raise ComposerError(
                "Stacksmith is unavailable. Set COMPOSER_STACKSMITH_COMMAND "
                "to your Stacksmith executable and restart the API.",
                503,
            )
        with TemporaryDirectory(prefix="stacksmith-composer-") as directory:
            if source is not None:
                Path(directory, "stack.yaml").write_text(source)
                args = [*args, "--stack", str(Path(directory, "stack.yaml"))]
            try:
                result = subprocess.run(
                    [self.command, *args, "--config", str(self.settings.config)],
                    shell=False,
                    cwd=directory,
                    env={
                        key: value
                        for key, value in os.environ.items()
                        if key in {"PATH", "HOME", "TMPDIR", "LANG", "SYSTEMROOT"}
                    },
                    capture_output=True,
                    text=True,
                    timeout=self.settings.command_timeout,
                    check=False,
                )
            except subprocess.TimeoutExpired as exc:
                raise ComposerError("Stacksmith inspection timed out.", 504) from exc
            except OSError as exc:
                raise ComposerError(
                    "Could not launch the Stacksmith executable.", 503
                ) from exc
        if result.returncode:
            # CLI diagnostics may contain resolved inputs or hook output. Do not expose
            # arbitrary stderr to browsers or application logs.
            raise ComposerError(
                "Stacksmith could not resolve this draft against the managed config. "
                "Check required inputs, association cardinality, and component outputs."
            )
        return result.stdout

    def _json(self, args: list[str], source: str | None = None) -> dict[str, Any]:
        try:
            return json.loads(self._run([*args, "--format", "json"], source))
        except json.JSONDecodeError as exc:
            raise ComposerError(
                "Stacksmith returned an incompatible inspection response.", 502
            ) from exc

    def catalog(self) -> dict[str, Any]:
        """Return module inspection metadata from the configured Stacksmith CLI.

        Returns:
            Component types keyed by their managed names.

        Raises:
            ComposerError: If the CLI cannot inspect the trusted configuration.
        """
        return self._json(["info", "modules-and-policies"])

    def associations(self, source: str) -> dict[str, Any]:
        """Resolve managed associations for an authored stack in a temporary workspace.

        Args:
            source: Stack source with supported quoted Jinja references.

        Returns:
            Stacksmith's association provenance response.

        Raises:
            ComposerError: If the stack cannot be resolved.
        """
        return self._json(["info", "associations"], source)
