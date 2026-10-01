# GitHub workflow

When GitHub App authentication is configured, Composer can discover stack repositories and propose the reviewed stack-file change as a pull request.

## Sign in and choose a stack

The GitHub App installation and the signed-in user both limit repository access. Composer filters repositories by the `stacksmith-stack` topic and discovers conventional stack files such as `stack.yaml`, `stack.yml`, `stack.json`, and their `*.stack.yaml`, `*.stack.yml`, or `*.stack.json` variants.

Repositories where the user has read access can be opened for review. Creating a pull request requires push permission to that repository. Fork-based contributions are not supported.

## Create a pull request

After review, Composer rechecks the source and repository permissions. It creates a deterministic `composer/…` branch with one changed stack file and opens a pull request against the branch from which the stack was read. Composer never writes directly to the default branch. Repeating the same proposal reuses the existing pull request.

Pull requests are ready for review by default. Set `COMPOSER_DRAFT_PULL_REQUESTS=true` to create draft pull requests instead. After creation, the review panel links to the pull request and offers its `.patch` file for download.

Composer checks that the base branch has not advanced before writing. If it has changed, reopen the stack and review the changes against the new revision. GitHub may still advance the branch after this check; normal pull request conflict handling then applies.

## CI and deployment

The pull request contains the reviewed source change. The repository's CI remains responsible for full Stacksmith validation, planning, policy checks, and deployment. Composer does not run or approve those steps.
