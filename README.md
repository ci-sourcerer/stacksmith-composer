# Stacksmith Platform

Stacksmith Platform combines visual stack authoring with a self-hosted execution system for [Stacksmith](https://github.com/ci-sourcerer/stacksmith). **Composer** is its visual editor. GitHub supplies identity, repositories, pull requests, and webhook events; the platform owns runs, approvals, permissions, logs, and reports.

The platform has one public FastAPI service and a separate worker supervisor. PostgreSQL holds durable control-plane state and the job queue. Each Stacksmith phase runs in a fresh Docker container or Kubernetes Job, with phase-scoped credentials and private artifact handoffs. Workers expose no separate inbound API.

## Authoring and execution

Composer retains component browsing, connections, association controls, source-preserving YAML/JSON editing, resolution history, browser recovery, source review, and GitHub pull requests. In execution mode, authoring and inspection also run in isolated containers; the API does not execute Stacksmith subprocesses.

The Runs page at `/runs` supports infrastructure plans, approved applies, previewed destroys, standalone operation previews and execution, live bounded phase logs, reports, audit history, and cancellation. Applies use the saved binary plan from the reviewed workspace. After-apply operations follow Stacksmith's own lifecycle and can replan against current outputs.

Same-repository PR events queue plans awaiting maintainer authorization for that exact revision before credentials are exposed. Fork PR execution is excluded. Default-branch pushes prepare deployments that wait for approval. Manual runs resolve the current default-branch tip on the server and save that immutable revision. An explicit commit override requires a platform administrator browser session, including administrator approval before deployment. Ordinary runs reject approval if the default branch advances.

GitHub repository access and platform permissions are both required. Administrators grant environment capabilities explicitly. Browser sign-in uses opaque sessions; scripts use hashed, scoped, expiring platform tokens. Deployment approval and uncertain-run reconciliation require an interactive browser session. API tokens expire no later than their issuing GitHub session, at most eight hours.

## Run with Docker Compose

Docker Compose is the primary way to run the whole platform. Use Python 3.15 for the project tasks; the managed Docker build supplies Node.js for the frontend.

```sh
uv sync --group dev
uv run poe configure
```

`configure` creates or updates the single `.env`, preserves existing credentials, generates local database/storage/webhook secrets, and restricts the file to mode 0600. It reports the settings you still need to fill without printing their values. Set the GitHub App ID, client credentials, administrator logins, approved config, and host path to the App's PEM file. The default Stacksmith base image is `docker.io/cisourcerer/stacksmith:latest`; replace it if you use a different image, or set it blank to use an already-built execution image.

After filling those settings, start the platform.

```sh
uv run poe compose-up
```

This validates configuration, builds the API/frontend with common-python-tasks, builds the execution wrapper when a Stacksmith base image is configured, and starts Compose with health checks. Open <http://localhost:8000> for Composer or <http://localhost:8000/runs> for runs. Configure the GitHub App callback as `http://localhost:8000/api/auth/callback` for these defaults.

```sh
uv run poe compose-logs
uv run poe compose-down
```

`compose-down` preserves the PostgreSQL and artifact volumes. `docker compose up -d --wait` also works directly after the images and `.env` are prepared. See the [deployment guide](docs/deployment.md) for all settings and hosted/Kubernetes deployment.

The old `poe dev` task has been removed because it started only an API and Vite process. It did not run the worker, database, or artifact storage and was not the platform development stack. Frontend dependencies are needed on the host only for frontend tests or direct frontend development.

## Container images

The API/worker image uses **common-python-tasks' managed Dockerfile**, including its wheel build, version metadata, dependency handling, and non-root runtime. A small Dockerfile hook adds the Node frontend build stage, and `deploy/platform.Dockerfile` copies its output into the managed runtime.

```sh
uv run poe platform-image
uv run poe execution-image
```

`platform-image` invokes the shared `build-image --single-arch` task and tags `stacksmith-platform:local`. The frontend builds inside Docker. The frontend is served by the API in the image; the Python wheel alone remains an API/worker artifact.

`execution-image` builds a fresh platform wheel in a temporary context and installs it into the Stacksmith image selected in `.env`. It records the resulting immutable Docker image ID in `.env`, so local Compose execution does not require a registry push. The Stacksmith base image must provide Python 3.15, its CLI, and its toolchain, including the version-two `ci prepare` / `ci execute` contract with saved-plan execution. Stacksmith remains a separately packaged tool; the platform does not import its internal models.

For Kubernetes, publish the execution image and use its named `repository@sha256:digest` reference. A local Docker image ID cannot be used by Kubernetes. Leave `STACKSMITH_PLATFORM_STACKSMITH_IMAGE` blank when using a prebuilt execution image that should not be rebuilt locally.

## Verification

Run formatting before linting and tests.

```sh
uv run poe format
uv run poe lint
uv run poe test
uv run poe build
npm --prefix web run format
npm --prefix web run lint
npm --prefix web test
npm --prefix web run build
helm lint deploy/helm/stacksmith-platform
```

The control-plane tests use SQLite by default. To exercise PostgreSQL locking and schema behavior, point `STACKSMITH_PLATFORM_TEST_DATABASE_URL` at a **disposable dedicated database** before running `tests/test_control.py`. These tests clear that database's platform tables. The existing real CLI integration tests remain opt-in through `STACKSMITH_TEST_COMMAND`.

Real GitHub sign-in, webhook delivery, and infrastructure execution require a dedicated GitHub App, test repository, and disposable infrastructure credentials. Never use production infrastructure for transport smoke tests.

The package, console commands, and settings prefix have changed to `stacksmith-platform`, `stacksmith_platform`, and `STACKSMITH_PLATFORM_`. Runtime configuration does not recognize old environment names. `poe configure` migrates the old GitHub client credentials, stable encryption key, and Composer config when present; sessions are not migrated. Authored stack files, Composer diagram metadata, and browser recovery formats remain intact.
