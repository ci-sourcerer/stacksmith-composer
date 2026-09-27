#!/usr/bin/env python3
"""Add the frontend build stage to common-python-tasks' managed Dockerfile."""

import sys
from pathlib import Path


def main() -> None:
    """Extend the managed template without replacing its Python image lifecycle.

    Returns:
        None.

    Raises:
        ValueError: The managed template no longer exposes its builder stage.
    """
    dockerfile = Path(sys.argv[1])
    source = dockerfile.read_text()
    marker = "FROM python:${PYTHON_VERSION} AS builder"
    if source.count(marker) != 1:
        raise ValueError(
            "The managed Dockerfile builder stage changed; update the frontend hook"
        )
    dockerfile.write_text(
        source.replace(
            marker,
            """FROM node:24-alpine AS platform_frontend
WORKDIR /web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

"""
            + marker,
        )
    )


if __name__ == "__main__":
    main()
