# Platform API

The platform API is under `/api/v1`. Composer's authoring and GitHub sign-in routes remain under `/api`. Both are served by the same FastAPI process. Interactive documentation is available at `/docs` and the generated schema at `/openapi.json`.

## Authentication

Browser requests use the HTTP-only `platform_session` cookie and send `X-Composer-Request: 1` on mutations. Browser origins must match the configured public origin. Automation sends `Authorization: Bearer <platform-token>`. Create expiring tokens through the Tokens panel or `POST /api/v1/tokens` using a browser session. Token values are returned once; only hashes are stored.

API tokens are limited to their selected repository, environment, and actions, plus the owner's current GitHub access and platform grants. They expire within their issuing session's remaining lifetime, at most eight hours. Deployment approvals, PR execution authorization, and uncertain-run reconciliation require an interactive session.

`GET /api/v1/tokens` lists only the current account's tokens. It accepts `page` (default 1), `page_size` (default 20, maximum 100), and `status` (`active`, `all`, `expired`, or `revoked`; default `active`). The response contains `items`, `page`, `page_size`, `total`, and account-wide status `counts`. Each item contains `id`, `name`, `expires`, `revoked`, `repository`, `environment`, `permissions`, and `workloads`. This metadata never includes token values or the stored GitHub credential. Token status is derived from revocation state and expiry; revoked takes precedence over expired.

## Run requests

`POST /api/v1/runs` requires an `Idempotency-Key` header and a JSON body like this.

```json
{
  "repository": "acme/service",
  "environment": "production",
  "action": "apply",
  "include_infrastructure": true,
  "include_operations": true,
  "apply_after_plan": true,
  "destroy_plan": false,
  "operations": []
}
```

The four phase flags select infrastructure planning, operation planning, applying after approval, and destroy planning. Set `destroy_plan` without `apply_after_plan` to create a destroy preview; set both to destroy after approval. `action` remains a derived lifecycle label: `plan`, `apply`, `destroy-plan`, `destroy`, `plan-operation`, or `apply-operation`. `operations` may select a subset when operation planning is enabled; an empty list selects all declared operations. Requests using only the older `action` field continue to map to the corresponding default phase set. Omit `revision` to resolve the latest default-branch commit on the server. The chosen SHA is stored with the run, and reusing the idempotency key returns that same run even if the branch has advanced. Supplying an explicit full SHA requires an interactive platform administrator session; deployment of an override also requires administrator approval. Ordinary approvals still require the default branch to remain at the captured revision. Different inputs for the same key produce `409`. The API does not accept arbitrary command strings, executable paths, or unrestricted Stacksmith flags.

`GET /runs?repository=acme/service&environment=production` accepts `page` (default 1) and `page_size` (default 20, maximum 100). It returns an envelope containing `items`, `page`, `page_size`, and `total`, ordered newest first. `GET /runs/{id}` includes the immutable specification, current phase/status, review results, and approval expiry. Subresources provide logs, audit history, and authorized review artifacts. Artifact content is proxied through the API; private execution context is never exposed.

`POST /runs/{id}/authorize` permits credentialed execution of an exact PR revision. `POST /runs/{id}/approve` approves a successfully previewed deployment. `POST /runs/{id}/cancel` requests cancellation. `POST /runs/{id}/resolve` requires a reconciliation note and releases an uncertain run's deployment lock after operator inspection; it never resumes execution.

`GET /repositories/{owner}/{repo}/environments/{name}/operations` requires view access to the environment. It inspects the latest default-branch commit in an isolated execution and returns its `revision` and an `operations` list containing stack-local `name`, `description`, and `stacks` fields. Discovery uses Stacksmith's environment and stack metadata APIs without planning infrastructure. An empty run request's `operations` list selects all declared operations; a nonempty list selects those names and their dependencies.

Interactive platform administrators can set `allow_local_backend: true` on non-mutating plans for disposable local-backend testing. Apply and destroy requests reject this option. Workspace files pass between phases within a run; local state is not reused by later runs.

## Administration

Repository discovery replaces registration. `GET /api/repository-discovery` lists repositories accessible to the signed-in user and App. `GET /api/github-connection` returns the installation URL and accessible installation management links. `GET /api/auth/setup` verifies installation returns. Administrator `POST /api/v1/repositories/refresh` reconciles the complete App catalog. Administrator `POST /api/v1/repositories/{owner}/{repo}/deployment` accepts `{"enabled":true}` or `{"enabled":false}` to control deployment processing. New records inherit platform configuration and start with deployments disabled. The former `POST /api/v1/repositories` registration endpoint has been removed. Per-repository environment, grant, and secret-binding endpoints configure execution. Secret read responses contain metadata only.

Platform administrators read and update shared configuration through `GET /configuration` and `POST /configuration`. Policies contain `mode` and an ordered `refs` list of GitHub configuration file references pinned to full commit SHAs. Repository administrators use `GET /repositories/{owner}/{repo}/configuration` and `POST` on the same endpoint. Repository modes are `inherit`, `append`, and `replace`; `inherit` requires an empty `refs` list, while platform defaults use `replace`. Runs capture the effective layers; changing those layers invalidates queued execution and pending approvals that captured the previous policy.


## Service authentication

GitHub events use `/api/v1/webhooks/github` with a verified HMAC signature and deduplicated delivery ID. The one-use `/api/v1/executions/{id}/claim` endpoint accepts only the capability for that run's active phase. It cannot queue arbitrary work or access platform resources. Workers have no inbound service API; they consume jobs through their restricted database identity.

## Stack roles

Platform Admins remain configured through `STACKSMITH_PLATFORM_ADMIN_LOGINS`. Other users receive repository and environment role assignments. See [Roles and access](roles.md) for the role matrix and approval rules.

`GET /repositories/{owner}/{repo}/grants` and `POST` on that endpoint require an Admin browser session. Assignment bodies contain `login`, `environment` (`*` for all environments), `role` (`viewer`, `runner`, or `provisioner`), and `workloads` (`infrastructure`, `operations`, or both). Viewer assignments require an empty workload list; Runner and Provisioner assignments require a nonempty list. `DELETE /repositories/{owner}/{repo}/grants/{grant_id}` removes an assignment.

`GET /repositories/{owner}/{repo}/access?environment=dev` returns the signed-in user's assignments, administrator status, and effective capabilities. Assignments add access, and capabilities are computed independently for each assignment before merging. An Operations Provisioner combined with an Infrastructure Runner therefore cannot approve infrastructure changes.

Token creation retains the narrower `view`, `plan`, and `deploy` action permissions and adds `workloads`. Every token includes `view`; `plan` and `deploy` require at least one workload. Live role access limits token requests. Tokens cannot approve runs, change settings, author Composer changes, or manage assignments. Legacy token scopes are rejected and must be recreated.

## Deployment secret metadata

`GET /api/v1/repositories/{owner}/{repo}/environments/{name}/secret-references` requires the existing `manage_credentials` permission on a registered environment. It returns public source metadata without retrieving secret values.

```json
{
  "references": [
    {
      "reference": "aws-prod:production/token",
      "name": "production/token",
      "source": "aws-prod",
      "supports_json_key": true
    }
  ]
}
```

A source outage returns 503 instead of a partial catalog. The existing binding POST accepts optional `json_key` alongside `reference`. Unknown or disabled references and unsupported selectors return 422; source outages return 503. Stored binding metadata includes the reference and nullable selector without ciphertext or plaintext. See [Platform integrations](integrations.md) for deployment and provider configuration.


## Execution health

`GET /api/v1/status` remains administrator-only and now includes a `mode` discriminator. `worker` responses contain the current worker heartbeat list and stale-record count. `kubernetes-jobs` responses contain recent supervisor metadata, execution observations, scheduling errors, and recovery completion/freshness; they do not contain a worker list. Both modes return observation time and pending runs. Kubernetes Job observations are snapshots updated during supervision and recovery, rather than a separate live Kubernetes query on each page refresh. Supervisor generations and Job identifiers are metadata only and convey no execution capabilities.
