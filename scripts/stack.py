"""Project-owned Compose orchestration, adapted from common-python-tasks.

The foreground/watch lifecycle follows its MIT-licensed stack task, while
configuration and services belong to Stacksmith Platform.
"""

import json
import os
import platform as python_platform
import signal
import subprocess
import sys
from pathlib import Path

from common_python_tasks.project import get_project_version, get_uv_version
from dotenv import dotenv_values

from scripts import build_execution, configure, images

_MODE = Path(".data/stack-debug")
_DOCKERFILE = Path(".data/Dockerfile.api")


def _run_environment():
    values = {
        key: value
        for key, value in dotenv_values(".env", interpolate=False).items()
        if value is not None
    }
    return {
        **json.loads(values.get("STACKSMITH_PLATFORM_RUN_ENVIRONMENT") or "{}"),
        **{
            key.removeprefix("STACKSMITH_RUN_"): value
            for key, value in {**values, **os.environ}.items()
            if key.startswith("STACKSMITH_RUN_")
        },
    }


def _environment():
    # Poe loads .env before builds; discard stale platform values after builders
    # update image IDs and private keys in the file.
    return {
        **{
            key: value
            for key, value in os.environ.items()
            if not key.startswith("STACKSMITH_PLATFORM_")
        },
        "STACKSMITH_PLATFORM_RUN_ENVIRONMENT": json.dumps(_run_environment()),
        **(
            {
                "STACKSMITH_BUILD_PYTHON_VERSION": python_platform.python_version(),
                "STACKSMITH_BUILD_UV_VERSION": get_uv_version(),
                "STACKSMITH_BUILD_PACKAGE_VERSION": get_project_version(),
            }
            if _DOCKERFILE.exists()
            else {}
        ),
    }


def _run(*arguments, debug=None, check=True):
    return subprocess.run(
        [
            "docker",
            "compose",
            "--file",
            "compose.yaml",
            *(
                ["--file", "compose.debug.yaml"]
                if (debug if debug is not None else _MODE.exists())
                else []
            ),
            *arguments,
        ],
        shell=False,
        check=check,
        env=_environment(),
    )


def _clear_debug():
    _MODE.unlink(missing_ok=True)
    _DOCKERFILE.unlink(missing_ok=True)


def _foreground(debug):
    status = 0
    try:
        status = _run(
            "up",
            *(["--watch"] if debug else ["--no-build"]),
            "--force-recreate",
            "--remove-orphans",
            debug=debug,
            check=False,
        ).returncode
    except KeyboardInterrupt:
        status = 130
    finally:
        # The terminal sends SIGINT to both Python and Compose. Let teardown
        # finish even when the foreground command was interrupted.
        previous_handler = signal.signal(signal.SIGINT, signal.SIG_IGN)
        try:
            cleanup_status = _run(
                "rm", "--force", "--stop", "--volumes", debug=debug, check=False
            ).returncode
        finally:
            signal.signal(signal.SIGINT, previous_handler)
            _clear_debug()
    sys.exit(status or cleanup_status)


def up(debug: bool = False, detach: bool = False, no_cache: bool = False) -> None:
    """Build and start every service in the local platform stack.

    Args:
        debug: Enable Python debugging and frontend development; watch when attached.
        detach: Start in the background and wait for healthy services.
        no_cache: Disable image build caches.

    Returns:
        None.

    Raises:
        SystemExit: Configuration is invalid or foreground startup has finished.
        subprocess.CalledProcessError: An image build or detached startup fails.
        OSError: Development state cannot be written.
    """
    configure.check()
    images.platform(no_cache=no_cache)
    images.frontend(debug=debug, no_cache=no_cache)
    build_execution.main(no_cache=no_cache)
    if debug:
        _DOCKERFILE.parent.mkdir(exist_ok=True)
        _DOCKERFILE.write_text(images.platform(debug=True, no_cache=no_cache))
        _MODE.touch()
    else:
        _clear_debug()
    if detach:
        _run(
            "up",
            "--detach",
            "--wait",
            "--no-build",
            "--force-recreate",
            "--remove-orphans",
            debug=debug,
        )
    else:
        _foreground(debug)


def down() -> None:
    """Stop and remove stack containers, preserving named data volumes.

    Returns:
        None.

    Raises:
        subprocess.CalledProcessError: Compose cannot remove the containers.
        OSError: Development state cannot be removed.
    """
    _run("rm", "--force", "--stop", "--volumes")
    _clear_debug()


def logs() -> None:
    """Follow frontend, API, and worker logs.

    Returns:
        None.

    Raises:
        subprocess.CalledProcessError: Compose cannot read the logs.
    """
    _run("logs", "--follow", "frontend", "api", "worker")


def db_shell() -> None:
    """Open an interactive administrator psql shell in the running database.

    Returns:
        None.

    Raises:
        subprocess.CalledProcessError: The database shell fails.
    """
    _run("exec", "postgres", "psql", "--username", "platform", "--dbname", "platform")


def run_db_migrations() -> None:
    """Initialize the existing platform schema and refresh runtime role grants.

    Returns:
        None.

    Raises:
        SystemExit: Required configuration is missing.
        subprocess.CalledProcessError: Initialization or database grants fail.
    """
    configure.check()
    _run("up", "--detach", "--wait", "postgres", debug=False)
    _run("run", "--rm", "--no-deps", "migrate", debug=False)
    _run("run", "--rm", "--no-deps", "database-grants", debug=False)
