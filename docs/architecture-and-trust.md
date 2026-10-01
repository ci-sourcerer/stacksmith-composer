# Architecture and trust

Composer has a React frontend and a FastAPI backend. The backend calls the separately installed Stacksmith command-line application for component catalog, association, and source inspection. Composer does not import Stacksmith's internal Python models.

## Reviewing a source change

When a repository stack is opened, the API signs a short-lived snapshot containing the source, repository path, branch, head commit, user identity, and managed configuration revision. The browser submits edits against that snapshot. It cannot replace the signed source, repository, or destination path.

The API composes the edited source, checks it with Stacksmith, extracts explicit reference paths, and checks component cycles across explicit references and managed relationships. It returns the proposed source and diff for review. Creating a pull request repeats inspection, checks current GitHub permissions and the captured base revision, then writes a new commit and branch containing only the stack file.

## Access and credentials

GitHub access is bounded by both the user's permissions and the GitHub App installation. Tokens are encrypted in the server-side SQLite session store and represented in the browser by an opaque HTTP-only cookie. Sessions expire after at most eight hours.

During Stacksmith inspection in GitHub mode, the signed-in user's short-lived token is provided to the Stacksmith subprocess as a Git credential so approved private module and script sources can be read. Application secrets and ambient GitHub environment variables are not forwarded. Process isolation inside Composer is not an operating-system security boundary.

## Deployment boundary

Use Composer with administrator-approved Stacksmith configuration. Configuration hooks can execute Python code, and a subprocess can access files and credentials available to its operating-system identity. A deployment serving untrusted users needs worker isolation, restricted filesystem and network access, and controlled configuration and module revisions outside the Composer process.

Composer holds edits and diagram layout in the current browser tab. It uses SQLite for sessions and does not provide durable drafts or background job management. Use a same-origin HTTPS deployment for the frontend and API; mutations enforce same-origin request checks.
