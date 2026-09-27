import hashlib
import secrets
from typing import Annotated, Any
from urllib.parse import urlencode, urlparse

import httpx
from fastapi import APIRouter, Depends, FastAPI, Request
from fastapi.responses import JSONResponse, RedirectResponse
from itsdangerous import BadSignature, URLSafeTimedSerializer
from pydantic import BaseModel, Field
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .adapter import StacksmithAdapter
from .documents import compose_source, load_document, source_diff
from .errors import ComposerError
from .github import GitHubClient
from .graph import inspect_graph, validate_root_references
from .platform import platform_summary
from .sessions import SessionStore
from .settings import Settings

router = APIRouter(prefix="/api")


class Draft(BaseModel):
    """A proposed edit relative to a signed source snapshot."""

    snapshot: str = Field(max_length=300_000)
    components: dict[str, dict[str, Any]] = Field(max_length=200)
    disabled_associations: list[str] = Field(default_factory=list, max_length=200)


def _identity(request: Request) -> tuple[str, str] | None:
    session = request.app.state.sessions.get(
        request.cookies.get("composer_session", "")
    )
    if request.app.state.settings.github_enabled and session is None:
        raise ComposerError("Sign in with GitHub to access Composer.", 401)
    return session


def _principal(request: Request) -> str:
    session = _identity(request)
    return session[0] if session else "local-demo"


def _github(request: Request) -> GitHubClient:
    session = _identity(request)
    if session is None:
        raise ComposerError(
            "Configure a GitHub App to use repository and PR features.", 503
        )
    return GitHubClient(session[1])


def _signer(request: Request) -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(
        request.app.state.settings.secret_key, salt="composer-source-v1"
    )


def _config_revision(request: Request) -> str:
    return hashlib.sha256(request.app.state.settings.config.read_bytes()).hexdigest()


def _open_snapshot(request: Request, source: str, **metadata) -> dict[str, Any]:
    snapshot = {
        **metadata,
        "source": source,
        "principal": _principal(request),
        "config_revision": _config_revision(request),
    }
    result = {
        **metadata,
        "source": source,
        "snapshot": _signer(request).dumps(snapshot),
        "editable": True,
        "reason": None,
    }
    try:
        result["document"] = load_document(source)
    except ComposerError as exc:
        result.update(editable=False, reason=str(exc), document=None)
    return result


def _snapshot(request: Request, token: str) -> dict[str, Any]:
    try:
        snapshot = _signer(request).loads(token, max_age=86400)
    except BadSignature as exc:
        raise ComposerError(
            "This draft snapshot expired. Reopen the stack.", 409
        ) from exc
    if snapshot["principal"] != _principal(request):
        raise ComposerError("This draft belongs to a different session user.", 403)
    if snapshot["config_revision"] != _config_revision(request):
        raise ComposerError(
            "Platform configuration changed. Reopen the stack before reviewing.", 409
        )
    return snapshot


def _review(request: Request, draft: Draft) -> tuple[dict[str, Any], dict[str, Any]]:
    snapshot = _snapshot(request, draft.snapshot)
    source = compose_source(
        snapshot["source"],
        draft.components,
        draft.disabled_associations,
        snapshot["path"],
    )
    # Enforce document limits on the edited source too.
    catalog = request.app.state.adapter.catalog()
    validate_root_references(load_document(source), catalog)
    associations = request.app.state.adapter.associations(source)
    return snapshot, {
        "source": source,
        "diff": source_diff(snapshot["source"], source, snapshot["path"]),
        "edges": inspect_graph(draft.components, catalog, associations),
        "associations": associations,
        "validation": (
            "References and associations inspected. Full validation and plan run in CI."
        ),
    }


@router.get("/session")
def session_info(request: Request) -> dict[str, Any]:
    """Return connection mode and the current user's public login."""
    session = request.app.state.sessions.get(
        request.cookies.get("composer_session", "")
    )
    return {
        "mode": "github" if request.app.state.settings.github_enabled else "demo",
        "login": session[0] if session else None,
    }


@router.get("/health")
def health() -> dict[str, str]:
    """Report API liveness independently of external services."""
    return {"status": "ok"}


@router.get("/catalog", dependencies=[Depends(_identity)])
def catalog(request: Request) -> dict[str, Any]:
    """Return public component metadata from the separate Stacksmith installation."""
    return request.app.state.adapter.catalog()


@router.get("/platform", dependencies=[Depends(_identity)])
def platform(request: Request) -> dict[str, Any]:
    """Return an allowlisted, descriptive view of the trusted platform config."""
    return platform_summary(request.app.state.settings.config)


@router.get("/sample", dependencies=[Depends(_identity)])
def sample(request: Request) -> dict[str, Any]:
    """Open the bundled example in anonymous local demonstration mode."""
    if request.app.state.settings.github_enabled:
        raise ComposerError("The local example is disabled in GitHub mode.", 404)
    return _open_snapshot(
        request,
        request.app.state.settings.sample.read_text(),
        repository=None,
        path="stack.yaml",
        branch="local example",
        head=None,
    )


@router.post("/review")
def review(request: Request, draft: Draft) -> dict[str, Any]:
    """Inspect a draft and return the exact authored source and diff for review."""
    return _review(request, draft)[1]


@router.get("/repositories")
def repositories(
    client: Annotated[GitHubClient, Depends(_github)],
) -> list[dict[str, Any]]:
    """List accessible GitHub repositories tagged `stacksmith-stack`."""
    return client.repositories()


@router.get("/repositories/{owner}/{repo}/stacks")
def stacks(owner: str, repo: str, client: Annotated[GitHubClient, Depends(_github)]):
    """Discover conventional stack paths on a repository's default branch."""
    return client.stacks(owner, repo)


@router.get("/repositories/{owner}/{repo}/stack")
def open_stack(
    request: Request,
    owner: str,
    repo: str,
    path: str,
    client: Annotated[GitHubClient, Depends(_github)],
):
    """Capture an immutable source snapshot for a discovered GitHub stack."""
    discovered = client.stacks(owner, repo)
    if path not in discovered["paths"]:
        raise ComposerError("Select a discovered stack path.", 404)
    return _open_snapshot(
        request,
        client.source(owner, repo, path, discovered["head"]),
        repository=f"{owner}/{repo}",
        path=path,
        branch=discovered["branch"],
        head=discovered["head"],
    )


@router.post("/pull-requests")
def pull_request(
    request: Request, draft: Draft, client: Annotated[GitHubClient, Depends(_github)]
):
    """Reinspect a reviewed draft and open a draft PR under the user's permissions."""
    snapshot, inspected = _review(request, draft)
    if not snapshot["repository"] or not inspected["diff"]:
        raise ComposerError("There are no repository changes to propose.")
    return client.create_pr(snapshot, inspected["source"])


@router.get("/auth/github")
def github_login(request: Request) -> RedirectResponse:
    """Begin GitHub App user authorization with a short-lived signed state cookie."""
    settings = request.app.state.settings
    if not settings.github_enabled:
        raise ComposerError("GitHub App credentials have not been configured.", 503)
    state = secrets.token_urlsafe(32)
    response = RedirectResponse(
        "https://github.com/login/oauth/authorize?"
        + urlencode(
            {
                "client_id": settings.github_client_id,
                "redirect_uri": settings.public_url + "/api/auth/callback",
                "state": state,
            }
        )
    )
    response.set_cookie(
        "composer_oauth",
        _signer(request).dumps(state),
        max_age=600,
        httponly=True,
        secure=settings.public_url.startswith("https:"),
        samesite="lax",
        path="/api/auth",
    )
    return response


def _exchange_token(settings: Settings, code: str) -> dict[str, Any]:
    try:
        response = httpx.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "client_id": settings.github_client_id,
                "client_secret": settings.github_client_secret,
                "code": code,
                "redirect_uri": settings.public_url + "/api/auth/callback",
            },
            timeout=20,
        )
        response.raise_for_status()
        token = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise ComposerError(
            "GitHub authorization failed. Please sign in again.", 502
        ) from exc
    if "access_token" not in token:
        raise ComposerError(
            "GitHub authorization was denied or expired. Please sign in again.", 401
        )
    return token


@router.get("/auth/callback")
def github_callback(request: Request, code: str, state: str) -> RedirectResponse:
    """Exchange a GitHub code and store the token only in the server session store."""
    try:
        expected = _signer(request).loads(
            request.cookies.get("composer_oauth", ""), max_age=600
        )
    except BadSignature as exc:
        raise ComposerError(
            "GitHub login expired. Please start sign-in again.", 401
        ) from exc
    if not secrets.compare_digest(expected, state):
        raise ComposerError("GitHub login state did not match.", 401)
    settings = request.app.state.settings
    token = _exchange_token(settings, code)
    request.app.state.sessions.delete(request.cookies.get("composer_session", ""))
    response = RedirectResponse(settings.public_url)
    response.set_cookie(
        "composer_session",
        request.app.state.sessions.create(
            GitHubClient(token["access_token"]).user()["login"],
            token["access_token"],
            token.get("expires_in", 28800),
        ),
        max_age=min(token.get("expires_in", 28800), 28800),
        httponly=True,
        secure=settings.public_url.startswith("https:"),
        samesite="lax",
    )
    response.delete_cookie("composer_oauth", path="/api/auth")
    return response


@router.post("/auth/logout")
def logout(request: Request) -> JSONResponse:
    """Invalidate the current session and expire its cookie."""
    request.app.state.sessions.delete(request.cookies.get("composer_session", ""))
    response = JSONResponse({"ok": True})
    response.delete_cookie("composer_session")
    return response


async def _protect_mutations(request: Request, call_next):
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        origin = request.headers.get("origin")
        if request.headers.get("x-composer-request") != "1" or (
            origin and origin != request.app.state.settings.public_url
        ):
            return JSONResponse(
                {"detail": "Request origin could not be verified."}, status_code=403
            )
    return await call_next(request)


async def _composer_error(_request: Request, exc: ComposerError):
    return JSONResponse({"detail": str(exc)}, status_code=exc.status)


def create_app(settings: Settings | None = None) -> FastAPI:
    """Create the independently packaged Composer HTTP API.

    Args:
        settings: Explicit configuration for tests or embedded development.

    Returns:
        FastAPI application with a separate CLI adapter and encrypted session store.
    """
    app = FastAPI(title="Stacksmith Composer", version="0.1.0")
    app.state.settings = settings or Settings()
    app.state.adapter = StacksmithAdapter(app.state.settings)
    app.state.sessions = SessionStore(
        app.state.settings.database, app.state.settings.secret_key
    )
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=[
            urlparse(app.state.settings.public_url).hostname,
            "127.0.0.1",
            "localhost",
            "testserver",
        ],
    )
    app.middleware("http")(_protect_mutations)
    app.add_exception_handler(ComposerError, _composer_error)
    app.include_router(router)
    return app
