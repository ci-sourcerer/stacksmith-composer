import json
import os
import shutil
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import BoundedSemaphore
from typing import Any
from urllib.parse import parse_qs, quote, urlparse

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

    def _run(
        self,
        args: list[str],
        source: str | None = None,
        github_token: str | None = None,
    ) -> str:
        if not self.slots.acquire(timeout=1):
            raise ComposerError(
                "Stacksmith is busy inspecting another draft. Retry shortly.", 503
            )
        try:
            return self._execute(args, source, github_token)
        finally:
            self.slots.release()

    def _execute(
        self,
        args: list[str],
        source: str | None = None,
        github_token: str | None = None,
    ) -> str:
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
                    [
                        self.command,
                        *args,
                        "--config",
                        str(self.settings.config),
                        "--build-dir",
                        str(self.settings.stacksmith_build_dir),
                    ],
                    shell=False,
                    cwd=directory,
                    env=_subprocess_environment(github_token),
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

    def _json(
        self,
        args: list[str],
        source: str | None = None,
        github_token: str | None = None,
    ) -> dict[str, Any]:
        try:
            return json.loads(
                self._run([*args, "--format", "json"], source, github_token)
            )
        except json.JSONDecodeError as exc:
            raise ComposerError(
                "Stacksmith returned an incompatible inspection response.", 502
            ) from exc

    def catalog(self, github_token: str | None = None) -> dict[str, Any]:
        """Return module inspection metadata from the configured Stacksmith CLI.

        Returns:
            Component types keyed by their managed names.

        Raises:
            ComposerError: If the CLI cannot inspect the trusted configuration.
        """
        return _relative_module_sources(
            self._json(["info", "modules-and-policies"], github_token=github_token),
            self.settings.module_source_prefix,
        )

    def associations(
        self, source: str, github_token: str | None = None
    ) -> dict[str, Any]:
        """Resolve managed associations for an authored stack in a temporary workspace.

        Args:
            source: Stack source with supported quoted Jinja references.

        Returns:
            Stacksmith's association provenance response.

        Raises:
            ComposerError: If the stack cannot be resolved.
        """
        return self._json(["info", "associations"], source, github_token)


def _subprocess_environment(github_token: str | None) -> dict[str, str]:
    environment = {
        key: value
        for key, value in os.environ.items()
        if key in {"PATH", "HOME", "TMPDIR", "LANG", "SYSTEMROOT"}
    }
    if github_token:
        environment["STACKSMITH_GIT_TOKEN"] = github_token
    return environment


def _relative_module_sources(
    catalog: dict[str, Any], prefix: Path | None
) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for name, value in catalog.items():
        if not isinstance(value, dict) or not isinstance(
            value.get("module_source"), str
        ):
            result[name] = value
            continue
        definition = {**value}
        if source_url := _module_source_url(
            value["module_source"], value.get("module_version")
        ):
            definition["module_source_url"] = source_url
        if prefix is not None and not source_url:
            try:
                definition["module_path"] = (
                    Path(value["module_source"])
                    .resolve()
                    .relative_to(prefix)
                    .as_posix()
                )
                definition["module_source"] = definition["module_path"]
            except ValueError:
                pass
        result[name] = definition
    return result


def _module_source_url(source: str, version: Any = None) -> str | None:
    rendered = source.removeprefix("git::")
    parsed = urlparse(rendered)
    if parsed.scheme != "https" or parsed.hostname != "github.com":
        return None
    repository_path, separator, module_path = parsed.path.removesuffix(
        ".git"
    ).partition(".git//")
    if not separator:
        repository_path, separator, module_path = parsed.path.partition("//")
    repository = repository_path.removesuffix(".git").strip("/")
    if len(repository.split("/")) != 2:
        return None
    url = f"https://github.com/{repository}"
    has_subpath_separator = bool(separator)
    query_ref = parse_qs(parsed.query).get("ref", [None])[0]
    ref = query_ref if query_ref else version
    if ref:
        url += f"/tree/{quote(str(ref), safe='')}"
    elif has_subpath_separator:
        url += "/tree/HEAD"
    if has_subpath_separator and module_path:
        url += f"/{'/'.join(quote(part, safe='') for part in module_path.split('/'))}"
    return url
