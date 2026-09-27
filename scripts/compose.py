"""Compose commands that reload generated image IDs and secrets from `.env`."""

import json
import os
import subprocess

from dotenv import dotenv_values


def _run(*arguments):
    source_environment = {
        **{
            key: value
            for key, value in dotenv_values(".env", interpolate=False).items()
            if value is not None
        },
        **os.environ,
    }
    subprocess.run(
        ["docker", "compose", *arguments],
        shell=False,
        check=True,
        env={
            **{
                key: value
                for key, value in os.environ.items()
                if not key.startswith("STACKSMITH_PLATFORM_")
            },
            "STACKSMITH_PLATFORM_RUN_ENVIRONMENT": json.dumps(
                {
                    key.removeprefix("STACKSMITH_RUN_"): value
                    for key, value in source_environment.items()
                    if key.startswith("STACKSMITH_RUN_")
                }
            ),
        },
    )


def start() -> None:
    """Start the complete stack and wait for its health checks.

    Returns:
        None.

    Raises:
        subprocess.CalledProcessError: Compose fails to start a healthy stack.
    """
    _run("up", "--detach", "--wait")


def down() -> None:
    """Stop the stack while preserving its database and artifact volumes.

    Returns:
        None.

    Raises:
        subprocess.CalledProcessError: Compose cannot stop the stack.
    """
    _run("down")


def logs() -> None:
    """Follow API and worker logs.

    Returns:
        None.

    Raises:
        subprocess.CalledProcessError: Compose cannot read the logs.
    """
    _run("logs", "--follow", "api", "worker")
