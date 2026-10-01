import json

import httpx
import pytest

from stacksmith_composer.errors import ComposerError
from stacksmith_composer.github import GitHubClient


class GitHubFixture:
    """Model GitHub's branch and pull-request APIs for write-path tests."""

    def __init__(self):
        self.requests = []
        self.current_head = "base-sha"
        self.writable = True
        self.existing_pr = False

    def handle(self, request):
        """Return the API response for a recorded request."""
        self.requests.append(request)
        path = request.url.path
        if path == "/repos/org/stacks":
            payload = {
                "topics": ["stacksmith-stack"],
                "permissions": {"push": self.writable},
            }
        elif path.endswith("/pulls"):
            if request.method == "GET":
                payload = (
                    [{"html_url": "https://github.com/org/stacks/pull/7", "number": 7}]
                    if self.existing_pr
                    else []
                )
            else:
                self.existing_pr = True
                payload = {
                    "html_url": "https://github.com/org/stacks/pull/7",
                    "number": 7,
                }
        elif path.endswith("/commits/main"):
            payload = {"sha": self.current_head}
        elif "/matching-refs/" in path:
            payload = []
        elif path.endswith("/git/commits/base-sha"):
            payload = {"tree": {"sha": "base-tree"}}
        elif path.endswith("/git/trees"):
            payload = {"sha": "new-tree"}
        elif path.endswith("/git/commits"):
            payload = {"sha": "new-commit"}
        elif path.endswith("/git/refs"):
            payload = {"ref": "created"}
        else:
            raise AssertionError(f"Unexpected request: {request.method} {path}")
        return httpx.Response(200, json=payload)


SNAPSHOT = {
    "repository": "org/stacks",
    "principal": "developer",
    "head": "base-sha",
    "branch": "main",
    "path": "apps/storefront/stack.yaml",
}


def test_pr_writes_exactly_one_file_to_a_new_branch_and_retries_reuse_pr():
    fixture = GitHubFixture()
    client = GitHubClient("test-token", httpx.MockTransport(fixture.handle))
    source = "name: changed\ncomponents: {}\n"
    first = client.create_pr(SNAPSHOT, source)
    request_count = len(fixture.requests)
    assert client.create_pr(SNAPSHOT, source) == first
    assert all(request.method == "GET" for request in fixture.requests[request_count:])
    writes = [request for request in fixture.requests if request.method == "POST"]
    assert len(writes) == 4
    tree = json.loads(writes[0].content)
    assert tree == {
        "base_tree": "base-tree",
        "tree": [
            {
                "path": SNAPSHOT["path"],
                "mode": "100644",
                "type": "blob",
                "content": source,
            }
        ],
    }
    assert json.loads(writes[2].content)["ref"].startswith("refs/heads/composer/")
    assert json.loads(writes[3].content)["draft"] is False
    assert first["patch_url"] == f"{first['url']}.patch"
    assert all(
        request.headers["authorization"] == "Bearer test-token"
        for request in fixture.requests
    )


def test_pr_can_be_created_as_a_draft():
    fixture = GitHubFixture()
    GitHubClient("token", httpx.MockTransport(fixture.handle)).create_pr(
        SNAPSHOT, "changed", draft=True
    )
    writes = [request for request in fixture.requests if request.method == "POST"]
    assert json.loads(writes[-1].content)["draft"] is True


def test_changed_base_prevents_all_writes():
    fixture = GitHubFixture()
    fixture.current_head = "advanced-sha"
    with pytest.raises(ComposerError, match="base branch changed"):
        GitHubClient("token", httpx.MockTransport(fixture.handle)).create_pr(
            SNAPSHOT, "changed"
        )
    assert all(request.method == "GET" for request in fixture.requests)


def test_lost_write_access_prevents_all_writes():
    fixture = GitHubFixture()
    fixture.writable = False
    with pytest.raises(ComposerError, match="write access"):
        GitHubClient("token", httpx.MockTransport(fixture.handle)).create_pr(
            SNAPSHOT, "changed"
        )
    assert all(request.method == "GET" for request in fixture.requests)


class DiscoveryFixture:
    """Return repositories visible through two installations, including duplicates."""

    def handle(self, request):
        """Serve discovery fixtures without network access."""
        if request.url.path == "/user/installations":
            return httpx.Response(200, json={"installations": [{"id": 1}, {"id": 2}]})
        return httpx.Response(
            200,
            json={
                "repositories": [
                    {
                        "id": 1,
                        "full_name": "org/stacks",
                        "topics": ["stacksmith-stack"],
                        "default_branch": "main",
                        "permissions": {"push": True},
                    },
                    {
                        "id": 2,
                        "full_name": "org/unrelated",
                        "topics": [],
                        "default_branch": "main",
                    },
                    {
                        "id": 3,
                        "full_name": "org/archived",
                        "topics": ["stacksmith-stack"],
                        "default_branch": "main",
                        "archived": True,
                        "permissions": {"push": True},
                    },
                ]
            },
        )


def test_discovery_filters_topics_deduplicates_and_marks_archived_read_only():
    repositories = GitHubClient(
        "token", httpx.MockTransport(DiscoveryFixture().handle)
    ).repositories()
    assert [repo["name"] for repo in repositories] == ["org/archived", "org/stacks"]
    assert repositories[0]["writable"] is False
    assert repositories[1]["writable"] is True
