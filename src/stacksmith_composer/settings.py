from pathlib import Path
from secrets import token_urlsafe

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Read deployment settings from environment variables and a local `.env`."""

    model_config = SettingsConfigDict(env_prefix="COMPOSER_", env_file=".env")
    stacksmith_command: str = "stacksmith"
    config: Path = Path("examples/platform.yaml")
    sample: Path = Path("examples/stack.yaml")
    module_source_prefix: Path | None = None
    public_url: str = "http://127.0.0.1:5173"
    database: Path = Path(".data/composer.sqlite3")
    secret_key: str = Field(default_factory=lambda: token_urlsafe(48))
    github_client_id: str = ""
    github_client_secret: str = ""
    command_timeout: int = 30

    @property
    def github_enabled(self) -> bool:
        """Return whether a GitHub App is configured."""
        return bool(self.github_client_id)

    @model_validator(mode="after")
    def _validate_github_settings(self):
        if bool(self.github_client_id) != bool(self.github_client_secret):
            raise ValueError("Both GitHub client ID and client secret are required")
        if self.github_enabled and (
            "secret_key" not in self.model_fields_set or len(self.secret_key) < 32
        ):
            raise ValueError(
                "GitHub mode requires a stable secret key of 32+ characters"
            )
        self.config = self.config.resolve()
        self.sample = self.sample.resolve()
        if self.module_source_prefix is not None:
            self.module_source_prefix = self.module_source_prefix.resolve()
        self.public_url = self.public_url.rstrip("/")
        return self
