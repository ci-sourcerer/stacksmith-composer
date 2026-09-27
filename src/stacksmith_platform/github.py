import base64
import hashlib
from collections.abc import Callable
from typing import Any
from urllib.parse import quote

import httpx

from .documents import MAX_SOURCE_BYTES
from .errors import ComposerError


def _segment(value: str) -> str:
    return quote(value, safe="")


class GitHubClient:
    """Use a GitHub App user access token for repository reads and PR creation.

    Args:
        token: User-scoped access token, never an installation-wide write token.
        transport: Optional HTTP transport for deterministic integration tests.
    """

    def __init__(self, token: str, transport: httpx.BaseTransport | None = None):
        self.token = token
        self.transport = transport

    def _request(self, method: str, path: str, **kwargs) -> Any:
        try:
            with httpx.Client(
                base_url="https://api.github.com",
                headers={
                    "Authorization": f"Bearer {self.token}",
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
                timeout=20,
                transport=self.transport,
            ) as client:
                response = client.request(method, path, **kwargs)
        except httpx.RequestError as exc:
            raise ComposerError(
                "GitHub is temporarily unreachable. Please retry.", 502
            ) from exc
        if response.status_code in {401, 403}:
            raise ComposerError(
                "GitHub access was denied. Sign in again or check app permissions.", 403
            )
        if response.status_code == 404:
            raise ComposerError(
                "This GitHub resource is unavailable to your account and app.", 404
            )
        if response.is_error:
            raise ComposerError(
                "GitHub rejected the operation. Refresh the repository and retry.",
                409 if response.status_code in {409, 422} else 502,
            )
        return response.json() if response.content else None

    def _pages(self, path: str, key: str):
        for page in range(1, 101):
            payload = self._request(
                "GET", path, params={"per_page": 100, "page": page}
            )[key]
            yield from payload
            if len(payload) < 100:
                return
        raise ComposerError("Repository discovery exceeded its page limit.", 503)

    def user(self) -> dict[str, Any]:
        """Return the authenticated GitHub user."""
        return self._request("GET", "/user")

    def repositories(self) -> list[dict[str, Any]]:
        """Discover repositories accessible to both the user and app.

        Returns:
            Repository summaries, including current push permission.
        """
        repositories = {}
        for installation in self._pages("/user/installations", "installations"):
            for repo in self._pages(
                f"/user/installations/{installation['id']}/repositories", "repositories"
            ):
                repositories[repo["id"]] = {
                    "github_id": str(repo["id"]),
                    "installation_id": installation["id"],
                    "account": repo["full_name"].split("/")[0],
                    "management_url": installation.get("html_url"),
                    "name": repo["full_name"],
                    "description": repo.get("description"),
                    "default_branch": repo["default_branch"],
                    "writable": repo.get("permissions", {}).get("push", False)
                    and not repo.get("archived", False),
                }
        return sorted(repositories.values(), key=lambda item: item["name"])

    def _repository(self, owner: str, repo: str) -> dict[str, Any]:
        return self._request("GET", f"/repos/{_segment(owner)}/{_segment(repo)}")

    def stacks(self, owner: str, repo: str) -> dict[str, Any]:
        """List conventional stack paths at the current default-branch commit.

        Args:
            owner: GitHub repository owner.
            repo: Repository name.

        Returns:
            Stack paths and their immutable base revision.
        """
        repository = self._repository(owner, repo)
        prefix = f"/repos/{_segment(owner)}/{_segment(repo)}"
        commit = self._request(
            "GET", f"{prefix}/commits/{_segment(repository['default_branch'])}"
        )
        tree = self._request(
            "GET", f"{prefix}/git/trees/{commit['sha']}", params={"recursive": 1}
        )
        if tree.get("truncated"):
            raise ComposerError(
                "This repository tree is too large for discovery in this version."
            )
        return {
            "branch": repository["default_branch"],
            "head": commit["sha"],
            "paths": [
                item["path"]
                for item in tree["tree"]
                if item["type"] == "blob"
                and item.get("mode") == "100644"
                and _is_stack_path(item["path"])
            ],
        }

    def source(self, owner: str, repo: str, path: str, ref: str) -> str:
        """Read a bounded UTF-8 stack file at a specific revision.

        Args:
            owner: Repository owner.
            repo: Repository name.
            path: Repository-relative stack file path.
            ref: Immutable commit or branch reference.

        Returns:
            Stack source text.

        Raises:
            ComposerError: If the file is oversized, unsupported, or inaccessible.
        """
        return self._read_repository_file(
            owner,
            repo,
            path,
            ref,
            path_validator=lambda value: (
                _is_stack_path(value)
                and all(part not in {"..", "."} for part in value.split("/"))
            ),
            invalid_path_error=("Choose a discovered stack file.", None),
            not_file_error=("Choose a regular stack file.", None),
            unreadable_error=(
                "This file is too large or cannot be read as stack source.",
                None,
            ),
            decode_error=("Stack files must contain UTF-8 text.", None),
        )[0]

    def repository_file(
        self, owner: str, repo: str, path: str, ref: str
    ) -> tuple[str, str]:
        """Read a bounded UTF-8 file and return its content and blob revision.

        Args:
            owner: Repository owner.
            repo: Repository name.
            path: Repository-relative file path.
            ref: Branch, tag, or commit reference.

        Returns:
            File content and its Git blob SHA.

        Raises:
            ComposerError: If the file is oversized, unsupported, or inaccessible.
        """
        content, payload = self._read_repository_file(
            owner,
            repo,
            path,
            ref,
            path_validator=lambda value: (
                bool(value)
                and all(part not in {"..", "."} for part in value.split("/"))
            ),
            invalid_path_error=("The managed config file path is invalid.", 503),
            not_file_error=("The managed config file is unavailable.", 503),
            unreadable_error=("The managed config file is too large.", 503),
            decode_error=("The managed config must be UTF-8 text.", 503),
        )
        return content, str(payload["sha"])

    def _read_repository_file(
        self,
        owner: str,
        repo: str,
        path: str,
        ref: str,
        *,
        path_validator: Callable[[str], bool],
        invalid_path_error: tuple[str, int | None],
        not_file_error: tuple[str, int | None],
        unreadable_error: tuple[str, int | None],
        decode_error: tuple[str, int | None],
    ) -> tuple[str, dict[str, Any]]:
        if not path_validator(path):
            raise ComposerError(*invalid_path_error)
        payload = self._request(
            "GET",
            f"/repos/{_segment(owner)}/{_segment(repo)}/contents/"
            f"{quote(path, safe='/')}",
            params={"ref": ref},
        )
        if not isinstance(payload, dict) or payload.get("type") != "file":
            raise ComposerError(*not_file_error)
        if (
            payload.get("size", 0) > MAX_SOURCE_BYTES
            or payload.get("encoding") != "base64"
        ):
            raise ComposerError(*unreadable_error)
        try:
            content = base64.b64decode(payload["content"]).decode("utf-8")
        except (KeyError, ValueError, UnicodeDecodeError) as exc:
            raise ComposerError(*decode_error) from exc
        return content, payload

    def create_pr(
        self, snapshot: dict[str, Any], source: str, draft: bool = False
    ) -> dict[str, Any]:
        """Create a deterministic branch and PR for exactly the reviewed stack source.

        Args:
            snapshot: Server-signed repository, path, revision, and author identity.
            source: Validated proposed source.
            draft: Whether GitHub should create the pull request as a draft.

        Returns:
            Pull request URL, patch URL, and number, reusing existing PRs on retries.

        Raises:
            ComposerError: If access changed, the base advanced, or a write failed.
        """
        owner, repo = snapshot["repository"].split("/")
        repository = self._repository(owner, repo)
        if repository.get("archived") or not repository.get("permissions", {}).get(
            "push"
        ):
            raise ComposerError(
                "You need write access to propose changes in this repository.", 403
            )
        prefix = f"/repos/{_segment(owner)}/{_segment(repo)}"
        branch = (
            "composer/"
            + hashlib.sha256(
                (
                    snapshot["principal"] + snapshot["head"] + snapshot["path"] + source
                ).encode()
            ).hexdigest()[:24]
        )
        existing = self._request(
            "GET",
            f"{prefix}/pulls",
            params={"head": f"{owner}:{branch}", "state": "all"},
        )
        if existing:
            return self._pr_result(existing[0])
        if (
            self._request("GET", f"{prefix}/commits/{_segment(snapshot['branch'])}")[
                "sha"
            ]
            != snapshot["head"]
        ):
            raise ComposerError(
                "The base branch changed. Reopen the stack and review your edits.",
                409,
            )
        self._create_branch(prefix, branch, snapshot, source)
        result = self._request(
            "POST",
            f"{prefix}/pulls",
            json={
                "title": f"feat(stack): update {snapshot['path']}",
                "head": branch,
                "base": snapshot["branch"],
                "body": "Generated by Stacksmith Platform.",
                "draft": draft,
            },
        )
        return self._pr_result(result)

    @staticmethod
    def _pr_result(pull_request: dict[str, Any]) -> dict[str, Any]:
        url = pull_request["html_url"]
        return {
            "url": url,
            "patch_url": f"{url}.patch",
            "number": pull_request["number"],
        }

    def _create_branch(
        self, prefix: str, branch: str, snapshot: dict[str, Any], source: str
    ):
        refs = self._request("GET", f"{prefix}/git/matching-refs/heads/{branch}")
        if any(ref["ref"] == f"refs/heads/{branch}" for ref in refs):
            owner, repo = snapshot["repository"].split("/")
            if self.source(owner, repo, snapshot["path"], branch) != source:
                raise ComposerError(
                    "The draft branch was changed externally. Reopen the stack.", 409
                )
            return
        commit = self._request("GET", f"{prefix}/git/commits/{snapshot['head']}")
        tree = self._request(
            "POST",
            f"{prefix}/git/trees",
            json={
                "base_tree": commit["tree"]["sha"],
                "tree": [
                    {
                        "path": snapshot["path"],
                        "mode": "100644",
                        "type": "blob",
                        "content": source,
                    }
                ],
            },
        )
        proposed = self._request(
            "POST",
            f"{prefix}/git/commits",
            json={
                "message": f"feat(stack): update {snapshot['path']}",
                "tree": tree["sha"],
                "parents": [snapshot["head"]],
            },
        )
        self._request(
            "POST",
            f"{prefix}/git/refs",
            json={"ref": f"refs/heads/{branch}", "sha": proposed["sha"]},
        )


def _is_stack_path(path: str) -> bool:
    return not path.startswith("/") and (
        path.split("/")[-1] in {"stack.yaml", "stack.yml", "stack.json"}
        or path.endswith((".stack.yaml", ".stack.yml", ".stack.json"))
    )
