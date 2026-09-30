# Zensical guide to `common-python-tasks`

This repository imports shared development tasks from [`common-python-tasks`](https://github.com/ci-sourcerer/common-python-tasks) through Poe the Poet.

## What this gives you

- One consistent command surface for formatting, linting, tests, packaging, and container workflows.
- No custom task wrappers to maintain in this repository.
- Shared updates across ci-sourcerer Python projects with less drift.

Composer intentionally excludes the bundled FastAPI development-stack tasks from the shared task set, because this project runs:

- its own API server command (`uv run poe api`)
- its own frontend server command (`uv run poe web` / `npm --prefix web run dev`)

## Day-to-day command set

Run these from the repository root:

```sh
uv run poe format
uv run poe lint
uv run poe test
uv run poe build
```

To inspect the currently imported and local tasks:

```sh
uv run poe --help
```

## Container and release-oriented tasks

Because they are inherited from `common-python-tasks`, you can also use the standard container flow when needed:

```sh
uv run poe build-image
uv run poe run-container
uv run poe container-shell
```

## Contributor zen

- Prefer shared tasks over one-off shell commands.
- Run format before lint, then tests.
- Keep API and web checks separate; both matter for Composer.
