# Stacksmith Composer

A visual authoring workspace for [Stacksmith](https://github.com/ci-sourcerer/stacksmith). Browse a platform's component catalog, connect public outputs to inputs, understand managed associations, review the authored diff, and open a GitHub draft pull request.

Composer is an independent project. Its FastAPI package is named `stacksmith-composer`, its React frontend lives in `web/`, and it calls a separately installed Stacksmith executable. Nothing is added to the Stacksmith CLI package. The web frontend and example modules are not included in the Composer Python wheel either; run the application from a checkout for now.

The Python project uses [`common-python-tasks`](https://github.com/ci-sourcerer/common-python-tasks) for shared development, packaging, release, and container-image tasks. Its bundled FastAPI development stack is explicitly excluded; Composer runs its own vanilla FastAPI application and keeps the React development server separate.

## Current implementation

- React, TypeScript, Vite, and React Flow canvas with draggable components and named input/output ports.
- Catalog and association resolution through the real `stacksmith info` JSON commands.
- Component property and tag editing, explicit output connections, and stack-level association opt-outs.
- Source-preserving YAML edits, JSON support, reviewed source download, and a unified diff.
- Friendly platform configuration view using descriptive metadata rather than backend credentials or Python hook source.
- Optional GitHub App sign-in, topic-based repository discovery, and draft PR creation under the user's permissions.
- Local example mode that needs no GitHub credentials and creates no cloud infrastructure.

## Local development

Use Python 3.12 or later for Composer and Node.js 22.12 or later for the frontend. The separate Stacksmith installation has its own Python requirement. From this project root, prepare the environments and local settings.

```sh
uv sync --group dev
npm --prefix web ci
cp .env.example .env
```

The example assumes a sibling `../stacksmith/.venv/bin/stacksmith` executable. Set `COMPOSER_STACKSMITH_COMMAND` in `.env` if yours is elsewhere. Composer does not install, import, or modify the sibling project.

Run the API from the project root.

```sh
uv run poe dev
```

In another terminal, start the frontend.

```sh
npm --prefix web run dev
```

Open <http://127.0.0.1:5173>. Vite proxies `/api` to the API on port 8000. Use `127.0.0.1` consistently because OAuth callbacks and mutation-origin checks use `COMPOSER_PUBLIC_URL`.

Package versions are derived from Git tags through `uv-dynamic-versioning`. Shared container tasks are also available, including `poe build-image`, `poe run-container`, and `poe container-shell`. The generated API image runs the `stacksmith-composer` console entry point and listens on `0.0.0.0:8000` by default. The React frontend remains a separate build artifact in this first version, and the API image still needs access to a separately installed Stacksmith executable.

The example opens a network, a database, and an application. Dashed lines represent the platform-managed private-network association; the solid line represents an explicit database endpoint reference. Drag another component from the palette or use its add button. Select a node to edit properties through the visual value editor, then review and download the stack. Each catalog input has its own control; lists and objects can be built recursively, connections appear as named links, and uncommon cases still have an advanced JSON fallback. The editor infers value types from authored data until Stacksmith exposes richer type metadata.

Drafts and diagram positions live in the current tab and are not persisted. Download the reviewed source or create a PR to keep changes. The browser warns before leaving a modified draft.

## GitHub App configuration

Create a GitHub App with repository **Contents: read and write**, **Pull requests: read and write**, and the default metadata access. Install it on the stack repositories you want Composer to access. Set its user authorization callback to `http://127.0.0.1:5173/api/auth/callback` for local development, and use the equivalent HTTPS URL for a hosted environment.

Add these settings to `.env`.

```dotenv
COMPOSER_GITHUB_CLIENT_ID=your-app-client-id
COMPOSER_GITHUB_CLIENT_SECRET=your-app-client-secret
COMPOSER_SECRET_KEY=your-stable-random-secret-at-least-32-characters-long
COMPOSER_CONFIG=/absolute/path/to/your/trusted/stacksmith-config.yaml
```

Use a securely generated secret. Do not commit `.env`. Restart the API after changing settings. With GitHub configured, anonymous example mode is disabled and the UI asks users to sign in.

Tag stack repositories with `stacksmith-stack`. Composer enumerates installations accessible to the authenticated user, filters their repositories by this topic, and discovers `stack.yaml`, `stack.yml`, `stack.json`, and `*.stack.yaml`, `*.stack.yml`, or `*.stack.json` files. Access is limited by both the user and the app. Read-only repositories can be opened, but PR creation requires push permission; fork-based contributions are not supported yet.

This version uses one administrator-selected managed config for every repository in the deployment. Only connect repositories that use that contract. Repository-selected configs, runfile/environment discovery, and layered edits are follow-up work.

GitHub tokens are encrypted in the local SQLite database and represented in the browser by an opaque HTTP-only cookie. Sessions last at most eight hours; sign in again when they expire. The same stable `COMPOSER_SECRET_KEY` is required across restarts. Changing that key requires clearing the session database. Refresh-token rotation and webhook-driven invalidation are not implemented yet.

PR creation uses a new deterministic `composer/…` branch and changes only the selected stack file. It checks the captured base commit before writing, rechecks push access, and reuses a previously created PR on retry. Composer never writes directly to the default branch. Full validation, plan, and deployment belong in the repository's CI.

## Supported authoring boundary

Visual edits support ordinary YAML/JSON mappings and quoted component output expressions. YAML comments and unchanged scalar styles are preserved, and an unchanged draft returns the original text exactly. Changed JSON files are formatted with two-space indentation. Whole-file Jinja blocks, YAML aliases/anchors, and custom tags open read-only. Only components and stack-level `disabled_associations` are editable; unrelated root fields remain intact.

Inspection checks public output references, managed association resolution, and component cycles. It is not full Stacksmith validation or an infrastructure plan. Unknown component types, unresolved inputs, or unsupported stacks may block inspection. The catalog currently lists explicit module mappings; convention-based component catalog discovery is not yet implemented.

The platform view describes the authored config file, not the fully merged effective configuration. Backend locations, credentials, hook bodies, and resolved inputs are deliberately excluded.

## Runtime boundary

This is an initial implementation for local development and trusted organization trials. The CLI adapter uses argument arrays, temporary working directories, a minimal inherited environment, a timeout, and a maximum of two concurrent subprocesses. GitHub tokens and Composer secrets are not passed to those processes. CLI stderr is not returned to browsers because it can contain resolved values.

A subprocess is not an operating-system security boundary. Managed configuration may execute Python hooks, and the worker still has the operating-system user's filesystem access, including home-directory credentials. Use only administrator-approved configs. Before deploying for untrusted users, introduce a dedicated sandboxed worker identity/container, restricted mounts and network access, bounded process output, persistent job control, and audited configuration provenance. The browser never chooses CLI arguments, executables, or config paths.

## Development checks

Run formatting before linting, followed by tests.

```sh
uv run poe format
uv run poe lint
uv run poe test
uv run poe build
npm --prefix web run format
npm --prefix web run lint
npm --prefix web test
npm --prefix web run build
```

Inspect the imported tasks with `uv run poe --help`. The task list intentionally excludes the `common-python-tasks` FastAPI development-stack tasks.

The real Stacksmith integration test is opt-in and uses only the local example modules.

```sh
STACKSMITH_TEST_COMMAND="$(pwd)/../stacksmith/.venv/bin/stacksmith" uv run poe test
```

The remaining tests use local fixtures and mocked GitHub HTTP responses. They never open actual PRs. GitHub sign-in and a real PR require a configured GitHub App and should be verified against a dedicated test repository before a hosted rollout.

See [the implementation plan](docs/implementation-plan.md) for the next increments and [the architecture](docs/architecture.md) for the API and trust boundaries.
