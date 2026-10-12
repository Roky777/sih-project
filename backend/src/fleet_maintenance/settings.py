from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="FLEET_", env_file=".env", extra="ignore")

    environment: str = "development"
    database_url: str = "sqlite+pysqlite:///./fleet.db"
    broker_url: str = "amqp://guest:guest@localhost:5672//"
    result_backend: str | None = None
    artifact_root: Path = Path("artifacts")
    session_secret: str = Field(default="local-demonstration-only", min_length=16)
    api_prefix: str = "/api"
    auto_create_schema: bool = False
    auto_seed_demo: bool = True
    authentication_mode: str = "demo"
    allow_signup: bool = False
    session_hours: int = Field(default=8, ge=1, le=24)
    secure_cookies: bool = False
    cookie_samesite: Literal["strict", "none"] = "strict"
    allowed_origins: list[str] = ["http://localhost:5173", "http://localhost:8080"]
    job_lease_seconds: int = Field(default=300, ge=30, le=3600)
    job_max_attempts: int = Field(default=3, ge=1, le=10)
    outbox_poll_seconds: float = Field(default=0.5, gt=0)
    outbox_batch_size: int = Field(default=50, ge=1, le=1000)
    maximum_request_bytes: int = Field(default=4000000, ge=1024, le=16000000)
    deployment_scope: str = "single_agency"
    # AI Maintenance Copilot (server-side only; never sent to the browser).
    assistant_enabled: bool = True
    assistant_ollama_url: str = "http://localhost:11434"
    assistant_model: str = "qwen3:8b"
    assistant_timeout_seconds: float = Field(default=120, ge=5, le=600)
    assistant_max_tool_iterations: int = Field(default=4, ge=1, le=8)
    # Larger windows raise model memory use; 8k fits Qwen3-8B on a 16 GB machine.
    assistant_context_tokens: int = Field(default=8192, ge=2048, le=32768)

    @model_validator(mode="after")
    def validate_release(self) -> "Settings":
        if self.deployment_scope != "single_agency":
            raise ValueError("Only isolated single-agency deployments are supported")
        if self.authentication_mode not in {"demo", "session"}:
            raise ValueError("authentication_mode must be demo or session")
        if self.cookie_samesite == "none" and self.environment != "tunnel_demo":
            raise ValueError("Cross-site cookies are supported only for the tunnel demonstration")
        if self.environment == "tunnel_demo":
            if self.authentication_mode != "session" or not self.secure_cookies:
                raise ValueError("Tunnel demo requires secure server sessions")
            if make_url(self.database_url).database != "fleet_public_demo" or not (
                self.database_url.startswith("postgresql")
            ):
                raise ValueError(
                    "Tunnel demo requires the isolated fleet_public_demo PostgreSQL DB"
                )
            if self.auto_create_schema or self.auto_seed_demo:
                raise ValueError("Tunnel demo requires explicit migrations and bootstrap")
            if not self.allowed_origins or any(
                not origin.startswith("https://") or origin == "https://*"
                for origin in self.allowed_origins
            ):
                raise ValueError("Tunnel demo requires explicit HTTPS origins")
        if self.environment == "production":
            if self.authentication_mode != "session" or not self.secure_cookies:
                raise ValueError("Production requires session authentication and secure cookies")
            if self.auto_create_schema or self.auto_seed_demo:
                raise ValueError(
                    "Production requires migrations and disables demonstration seeding"
                )
            if not self.database_url.startswith("postgresql"):
                raise ValueError("Production requires PostgreSQL transactional locking")
            if not self.allowed_origins or any(
                not origin.startswith("https://") or origin == "https://*"
                for origin in self.allowed_origins
            ):
                raise ValueError("Production requires explicit HTTPS origins")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
