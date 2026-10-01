# Configuration

Composer reads deployment settings from environment variables with the `COMPOSER_` prefix. When started from a checkout, it also reads a local `.env` file. Restart the API after changing settings.

## Stacksmith and source settings

| Setting | Purpose | Default |
| --- | --- | --- |
| `COMPOSER_STACKSMITH_COMMAND` | Stacksmith executable used for inspection | `stacksmith` |
| `COMPOSER_CONFIG` | Managed Stacksmith configuration path or GitHub `git+https` reference | `examples/platform.yaml` |
| `COMPOSER_SAMPLE` | Local example stack used in demo mode | `examples/stack.yaml` |
| `COMPOSER_MODULE_SOURCE_PREFIX` | Trusted local path prefix hidden from displayed module paths | Unset |
| `COMPOSER_STACKSMITH_BUILD_DIR` | Stacksmith build directory | `.data/stacksmith-build` |
| `COMPOSER_COMMAND_TIMEOUT` | Maximum duration of a Stacksmith inspection command, in seconds | `30` |

Composer invokes the separately installed Stacksmith executable. It does not install Stacksmith or modify its package. In GitHub mode, a private managed config can be selected with Stacksmith's `git+https` reference syntax. The GitHub App must have access to that config repository.

## GitHub App settings

| Setting | Purpose |
| --- | --- |
| `COMPOSER_GITHUB_CLIENT_ID` | GitHub App client ID |
| `COMPOSER_GITHUB_CLIENT_SECRET` | GitHub App client secret |
| `COMPOSER_SECRET_KEY` | Stable secret used to sign snapshots and encrypt session data |
| `COMPOSER_PUBLIC_URL` | Public origin used for OAuth callbacks and secure-cookie behavior |
| `COMPOSER_DATABASE` | SQLite session database path |
| `COMPOSER_DRAFT_PULL_REQUESTS` | Create draft PRs when set to `true`; defaults to regular PRs |

Set both GitHub client values to enable GitHub mode. Configure the GitHub App's user authorization callback as `<COMPOSER_PUBLIC_URL>/api/auth/callback`. Use HTTPS for hosted deployments and keep the same `COMPOSER_SECRET_KEY` across restarts. Changing the key invalidates existing signed sessions.

The GitHub App needs Contents read and write permission and Pull requests read and write permission on repositories where Composer will create pull requests. Metadata access is also required for repository discovery.

## Local example mode

Without GitHub App credentials, Composer runs in local demo mode against the configured sample stack and platform config. The sample can be inspected and edited in the browser, but repository discovery and pull request creation are unavailable.
