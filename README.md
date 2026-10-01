# Stacksmith Composer

A visual authoring workspace for [Stacksmith](https://github.com/ci-sourcerer/stacksmith). Browse a platform's component catalog, connect public outputs to inputs, understand managed associations, review the authored diff, and open a GitHub draft pull request.

Composer is an independent project. Its FastAPI package is named `stacksmith-composer`, its React frontend lives in `web/`, and it calls a separately installed Stacksmith executable. Nothing is added to the Stacksmith CLI package. The web frontend and example modules are not included in the Composer Python wheel either; run the application from a checkout for now.

The Python project uses [`common-python-tasks`](https://github.com/ci-sourcerer/common-python-tasks) for shared development, packaging, release, and container-image tasks. Its bundled FastAPI development stack is explicitly excluded; Composer runs its own vanilla FastAPI application and keeps the React development server separate.

## Current implementation

- React, TypeScript, Vite, and React Flow canvas with draggable components and named input/output ports.
- Catalog and association resolution through the real `stacksmith info` JSON commands.
- Component property and tag editing, explicit output connections, and stack-level association opt-outs.
- Source-preserving YAML edits, JSON support, reviewed source download, and a unified diff.
- Friendly platform configuration view with expandable static data and Python source previews, plus provider, module, and generation provenance links.
- Optional GitHub App sign-in, topic-based repository discovery, and draft PR creation under the user's permissions.
- Inspection-only AWS example backed by private, immutable GitHub module sources.

## Local development

Use Python 3.12 or later for Composer and Node.js 22.12 or later for the frontend. The separate Stacksmith installation has its own Python requirement. From this project root, prepare the environments and local settings.

```sh
uv sync --group dev
npm --prefix web ci
cp .env.example .env
```

The example assumes a sibling `../stacksmith/.venv/bin/stacksmith` executable. Set `COMPOSER_STACKSMITH_COMMAND` in `.env` if yours is elsewhere. Composer does not install, import, or modify the sibling project. Set `COMPOSER_MODULE_SOURCE_PREFIX` to a trusted filesystem prefix that should be removed from local module paths displayed in the catalog. Module sources outside that prefix remain unchanged.

The AWS example modules live in the private [`stacksmith-example-aws-modules`](https://github.com/ci-sourcerer/stacksmith-example-aws-modules) repository and are pinned to its `v0.1.0` release tag. Anonymous local example mode therefore needs a Git credential that can read that repository. For GitHub CLI development, run `gh auth setup-git` once. In GitHub mode, Composer supplies the signed-in user's short-lived GitHub App token to Stacksmith as an ephemeral Git credential.

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

The example composes a container-based AWS Lambda function, its IAM execution role, a customer-managed logging policy, and an AWS-managed read-only policy reference. Dashed lines supply the baseline policy to the role and the role to the function through platform-managed associations. The solid line is an explicit developer-authored attachment from `ReadOnlyAccess` to the role. The demo only inspects and renders the stack; it does not apply cloud infrastructure. A matching private [`stacksmith-example-aws-stack`](https://github.com/ci-sourcerer/stacksmith-example-aws-stack) repository is tagged `stacksmith-stack` for the authenticated discovery and pull-request flow. Drag another component from the palette or use its add button. Select a node to edit properties through the visual value editor, then review and download the stack. Each catalog input has its own control; lists and objects can be built recursively, connections appear as named links, and uncommon cases still have an advanced JSON fallback. The editor infers value types from authored data until Stacksmith exposes richer type metadata.

Drafts and diagram positions live in the current tab and are not persisted. Download the reviewed source or create a PR to keep changes. The browser warns before leaving a modified draft.

## GitHub App configuration

Create a GitHub App with repository **Contents: read and write**, **Pull requests: read and write**, and the default metadata access. Install it on the stack repositories you want Composer to access and on every private repository referenced by the managed Stacksmith configuration. Set its user authorization callback to `http://127.0.0.1:5173/api/auth/callback` for local development, and use the equivalent HTTPS URL for a hosted environment.

Add these settings to `.env`.

```dotenv
COMPOSER_GITHUB_CLIENT_ID=your-app-client-id
COMPOSER_GITHUB_CLIENT_SECRET=your-app-client-secret
COMPOSER_SECRET_KEY=your-stable-random-secret-at-least-32-characters-long
COMPOSER_CONFIG=git+https://github.com/ci-sourcerer/stacksmith-platform-config//stacksmith-config.yaml@main
```

Use a securely generated secret. Do not commit `.env`. Restart the API after changing settings. With GitHub configured, anonymous example mode is disabled and the UI asks users to sign in.

Tag stack repositories with `stacksmith-stack`. Composer enumerates installations accessible to the authenticated user, filters their repositories by this topic, and discovers `stack.yaml`, `stack.yml`, `stack.json`, and `*.stack.yaml`, `*.stack.yml`, or `*.stack.json` files. Access is limited by both the user and the app. Read-only repositories can be opened, but PR creation requires push permission; fork-based contributions are not supported yet.

This version uses one administrator-selected managed config for every repository in the deployment. In GitHub mode, `COMPOSER_CONFIG` can point directly to a private config file using Stacksmith's `git+https` reference syntax. The GitHub App must be installed on that config repository. Only connect stack repositories that use that contract. Repository-selected configs, runfile/environment discovery, and layered edits are follow-up work.

GitHub tokens are encrypted in the local SQLite database and represented in the browser by an opaque HTTP-only cookie. Sessions last at most eight hours; sign in again when they expire. The same stable `COMPOSER_SECRET_KEY` is required across restarts. Changing that key requires clearing the session database. During Stacksmith inspection, the current token is exposed only to the child process through Stacksmith's ephemeral Git credential environment. Refresh-token rotation and webhook-driven invalidation are not implemented yet.

PR creation uses a new deterministic `composer/…` branch and changes only the selected stack file. Set `COMPOSER_DRAFT_PULL_REQUESTS=true` to create draft PRs; otherwise Composer creates regular PRs. It checks the captured base commit before writing, rechecks push access, and reuses a previously created PR on retry. The PR patch can be downloaded from the review panel. Composer never writes directly to the default branch. Full validation, plan, and deployment belong in the repository's CI.

## Supported authoring boundary

Visual edits support ordinary YAML/JSON mappings and quoted component output expressions. YAML comments and unchanged scalar styles are preserved, and an unchanged draft returns the original text exactly. Changed JSON files are formatted with two-space indentation. Whole-file Jinja blocks, YAML aliases/anchors, and custom tags open read-only. Components, stack-level `disabled_associations`, and namespaced Composer diagram layout are editable; unrelated root fields remain intact. Diagram layout includes component positions and manually routed relationship vertices.

Inspection checks public output references, managed association resolution, and component cycles. It is not full Stacksmith validation or an infrastructure plan. Unknown component types, unresolved inputs, or unsupported stacks may block inspection. The catalog currently lists explicit module mappings; convention-based component catalog discovery is not yet implemented.

The platform view describes the authored config file, not the fully merged effective configuration. Source labels expand to show static data, inline Python, available local Python script contents, and other authored source configuration; GitHub sources link to their files. Credential-like configuration fields are redacted. Remote script contents are not fetched by the browser.

## Runtime boundary

This is an initial implementation for local development and trusted organization trials. The CLI adapter uses argument arrays, temporary working directories, a minimal inherited environment, a timeout, and a maximum of two concurrent subprocesses. Composer secrets and ambient GitHub environment variables are not passed to those processes. In GitHub mode, the signed-in user's token is passed as `STACKSMITH_GIT_TOKEN` so approved private module and script sources can be cloned. CLI stderr is not returned to browsers because it can contain resolved values.

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

Inspect the imported tasks with `uv run poe --help`. The task list intentionally excludes the `common-python-tasks` FastAPI development-stack tasks. See the [Zensical guide to common-python-tasks](docs/common-python-tasks.md) for the shared workflow used in this repository.

The real Stacksmith integration test is opt-in and needs Git read access to the private example modules.

```sh
STACKSMITH_TEST_COMMAND="$(pwd)/../stacksmith/.venv/bin/stacksmith" uv run poe test
```

The example managed configuration also includes four variable validations and four plan validations. Run their pass/fail cases with the separate Stacksmith CLI.

```sh
stacksmith test -c examples/platform.yaml examples/tests.yaml
```

The remaining tests use local fixtures and mocked GitHub HTTP responses. They never open actual PRs. GitHub sign-in and a real PR require a configured GitHub App and should be verified against a dedicated test repository before a hosted rollout.

See [the implementation plan](docs/implementation-plan.md) for the next increments and [the architecture](docs/architecture.md) for the API and trust boundaries.
