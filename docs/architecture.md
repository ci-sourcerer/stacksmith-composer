# Architecture

Composer is a separate application with a React frontend and a vanilla FastAPI API. The API calls Stacksmith through a small subprocess adapter; it does not depend on Stacksmith's internal Python models. The adapter expects the current JSON contracts for `info modules-and-policies` and `info associations`. It should become a version-negotiated contract when Stacksmith exposes a stable inspection schema.

## Project layout

| Path | Responsibility |
| --- | --- |
| `web/` | React application, graph interactions, catalog, properties, platform view, and source review |
| `src/stacksmith_composer/app.py` | HTTP routes, auth flow, signed snapshots, and application composition |
| `src/stacksmith_composer/adapter.py` | Separate Stacksmith executable, bounded subprocess concurrency, and JSON inspection |
| `src/stacksmith_composer/documents.py` | Authored YAML/JSON preservation and patching |
| `src/stacksmith_composer/graph.py` | Reference extraction, edge provenance, and cycle checks |
| `src/stacksmith_composer/github.py` | GitHub App user-token discovery, snapshots, branches, and PRs |
| `src/stacksmith_composer/sessions.py` | Encrypted server-side tokens in SQLite |
| `examples/` | Local platform contract, sample stack, validation scripts, and test manifest |

## Draft flow

Opening a stack captures its source, repository path, branch, head SHA, user identity, and the managed config file hash in a signed, expiring snapshot. The browser submits desired component definitions and association opt-outs against that snapshot. It cannot change the signed base source, repository, or destination path.

The API patches the authored document, inspects it with Stacksmith, extracts explicit reference edges, and checks cycles across both explicit and managed relationships. Nested list and object references retain their property paths. Root outputs and operation references are checked for dangling component references too. The response contains the exact proposed source and diff, alongside edges and association provenance.

The user reviews the diff before asking for a draft PR. The API repeats inspection, rechecks current GitHub permissions, and verifies that the base branch has not advanced. It creates a Git tree containing one changed file, a commit with the captured head as parent, and a new branch. A deterministic branch identity supports retry after partial success. An existing externally modified branch is rejected. This flow does not force-update any existing branch.

GitHub may advance the base after the preflight check; the PR still contains a commit based on the captured revision, and normal GitHub conflict handling applies. Updating drafts after a PR is opened, multiple-file changes, and explicit rebase support are future work.

## HTTP surface

| Endpoint | Purpose |
| --- | --- |
| `GET /api/session` | Current mode and public login |
| `GET /api/health` | Liveness |
| `GET /api/catalog` | Stacksmith module inspection |
| `GET /api/platform` | Allowlisted authored config metadata |
| `GET /api/sample` | Local example snapshot, only in demo mode |
| `POST /api/review` | Proposed authored source, diff, and resolved relationships |
| `GET /api/repositories` | Accessible topic-tagged repositories |
| `GET /api/repositories/{owner}/{repo}/stacks` | Conventional stack paths at an immutable revision |
| `GET /api/repositories/{owner}/{repo}/stack?path=…` | Signed stack snapshot |
| `POST /api/pull-requests` | Validated draft PR creation |
| `GET /api/auth/github` | Begin GitHub App user authorization |
| `GET /api/auth/callback` | Verify state and exchange authorization code |
| `POST /api/auth/logout` | Invalidate the server session |

FastAPI serves the OpenAPI schema at `/openapi.json`. Development uses Vite's `/api` proxy; hosted deployments should use a same-origin proxy for the frontend and API. Mutations require a custom request header and reject a mismatched Origin. No cross-origin API policy is enabled.

## Deliberate first-version limits

This implementation uses SQLite for sessions and holds drafts in the browser tab. Move durable drafts and jobs to PostgreSQL when introducing shared hosting. Snapshot signing provides integrity, not confidentiality; source is already visible to the authorized browser and signed snapshots must not be logged.

One deployment uses one trusted, local managed config. It does not load configuration selected by a repository or runfile. Platform summaries are allowlisted authored metadata and do not execute hooks. CLI inspection can resolve trusted hooks and remote modules, so it belongs in a sandboxed worker before a production multi-user deployment. Private Git sources receive the signed-in user's short-lived token through Stacksmith's ephemeral Git credential helper.

The subprocess environment excludes application secrets and ambient GitHub variables, but it includes the current user's Git token when authenticated and leaves HOME available for normal CLI operation. This does not protect against an approved config containing malicious hooks or against credential access through process environment or home-directory files. Production isolation must be enforced outside the Python process.

## Follow-up contract changes in Stacksmith

Keep these changes in the Stacksmith project, independent of Composer packaging.

- Versioned inspection JSON, including component graph provenance.
- Public input types, required/default metadata, sensitivity, and constraints for forms.
- Effective config and value provenance with sensitive values redacted.
- Structured source-located validation diagnostics.
- An explicit catalog for types resolved by `default_module_mapping`.
- Safe worker execution with source verification and pinned config/module revisions.
