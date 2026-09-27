import base64
import hashlib
import secrets
import sqlite3
import time
from pathlib import Path

from cryptography.fernet import Fernet


class SessionStore:
    """Keep encrypted GitHub tokens on the server behind opaque session cookies.

    Args:
        path: SQLite database path.
        secret: Stable deployment secret used to derive the encryption key.
    """

    def __init__(self, path: Path, secret: str):
        self.path = path
        self.cipher = Fernet(
            base64.urlsafe_b64encode(hashlib.sha256(secret.encode()).digest())
        )
        path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(path) as connection:
            connection.execute(
                "CREATE TABLE IF NOT EXISTS sessions "
                "(id TEXT PRIMARY KEY, login TEXT, token BLOB, expires REAL)"
            )
        path.chmod(0o600)

    def create(self, login: str, token: str, expires_in: int = 28800) -> str:
        """Save a token and return an opaque session identifier.

        Args:
            login: GitHub username.
            token: GitHub user access token, encrypted before persistence.
            expires_in: Lifetime in seconds, capped at eight hours.

        Returns:
            Random session identifier for an HTTP-only cookie.
        """
        identifier = secrets.token_urlsafe(32)
        with sqlite3.connect(self.path) as connection:
            connection.execute("DELETE FROM sessions WHERE expires < ?", (time.time(),))
            connection.execute(
                "INSERT INTO sessions VALUES (?, ?, ?, ?)",
                (
                    identifier,
                    login,
                    self.cipher.encrypt(token.encode()),
                    time.time() + min(expires_in, 28800),
                ),
            )
        return identifier

    def get(self, identifier: str) -> tuple[str, str] | None:
        """Return an unexpired user's login and decrypted token, or `None`.

        Args:
            identifier: Opaque session cookie.

        Returns:
            Login and token if the session exists and has not expired.
        """
        with sqlite3.connect(self.path) as connection:
            row = connection.execute(
                "SELECT login, token FROM sessions WHERE id = ? AND expires > ?",
                (identifier, time.time()),
            ).fetchone()
        return (row[0], self.cipher.decrypt(row[1]).decode()) if row else None

    def delete(self, identifier: str) -> None:
        """Delete a session when its user logs out.

        Args:
            identifier: Session identifier to invalidate.
        """
        with sqlite3.connect(self.path) as connection:
            connection.execute("DELETE FROM sessions WHERE id = ?", (identifier,))
