from functools import lru_cache
from ipaddress import ip_address, ip_network
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, model_validator
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
    demo_workspace_accounts: bool = False
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
    assistant_provider: Literal["ollama", "groq"] = "ollama"
    assistant_local_only: bool = True
    assistant_groq_api_key: SecretStr = SecretStr("")
    assistant_groq_model: str = "openai/gpt-oss-20b"
    assistant_ollama_url: str = "http://localhost:11434"
    assistant_model: str = "qwen3:8b"
    assistant_timeout_seconds: float = Field(default=120, ge=5, le=600)
    assistant_max_tool_iterations: int = Field(default=4, ge=1, le=8)
    # Larger windows raise model memory use; 8k fits Qwen3-8B on a 16 GB machine.
    assistant_context_tokens: int = Field(default=8192, ge=2048, le=32768)
    assistant_keep_alive: str = "30m"

    @model_validator(mode="after")
    def validate_release(self) -> "Settings":
        if self.demo_workspace_accounts and self.environment != "tunnel_demo":
            raise ValueError("Self-service workspace accounts require the isolated tunnel demo")
        if self.assistant_enabled and self.assistant_local_only:
            if self.assistant_provider != "ollama":
                raise ValueError("Private copilot mode requires the Ollama provider")
            if self.assistant_model.endswith(("-cloud", ":cloud")):
                raise ValueError("Private copilot mode does not allow cloud models")
            endpoint = urlsplit(self.assistant_ollama_url)
            local = endpoint.hostname in {"localhost", "host.docker.internal"}
            if endpoint.hostname:
                try:
                    address = ip_address(endpoint.hostname)
                    local = (
                        local
                        or address.is_loopback
                        or any(
                            address in ip_network(network)
                            for network in (
                                "10.0.0.0/8",
                                "172.16.0.0/12",
                                "192.168.0.0/16",
                                "fc00::/7",
                            )
                        )
                    )
                except ValueError:
                    pass
            if not local or endpoint.scheme not in {"http", "https"} or endpoint.username:
                raise ValueError(
                    "Private copilot mode requires a local or private-IP model endpoint"
                )
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
