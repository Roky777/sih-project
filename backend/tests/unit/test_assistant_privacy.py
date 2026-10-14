import pytest
from pydantic import ValidationError

from fleet_maintenance.settings import Settings


@pytest.mark.parametrize(
    "url",
    [
        "http://localhost:11434",
        "http://127.0.0.1:11434",
        "http://host.docker.internal:11434",
        "https://10.0.0.12:11434",
        "http://[::1]:11434",
    ],
)
def test_private_model_endpoints_are_allowed(url: str) -> None:
    assert Settings(assistant_ollama_url=url).assistant_local_only


@pytest.mark.parametrize(
    "config",
    [
        {"assistant_provider": "groq"},
        {"assistant_model": "qwen3:cloud"},
        {"assistant_model": "qwen3:large-cloud"},
        {"assistant_ollama_url": "https://public.example.com"},
        {"assistant_ollama_url": "http://8.8.8.8:11434"},
        {"assistant_ollama_url": "http://169.254.169.254"},
        {"assistant_ollama_url": "file:///tmp/model"},
    ],
)
def test_private_mode_rejects_hosted_or_public_model_configuration(config: dict[str, str]) -> None:
    with pytest.raises(ValidationError, match="Private copilot mode"):
        Settings(**config)  # type: ignore[arg-type]


def test_hosted_inference_requires_explicitly_disabling_private_mode() -> None:
    settings = Settings(assistant_local_only=False, assistant_provider="groq")
    assert settings.assistant_provider == "groq"
