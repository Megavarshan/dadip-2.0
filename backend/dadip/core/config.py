"""Environment-based configuration. Every secret comes from the environment; nothing has a usable default
in production (`DADIP_ENV=production` refuses to start with the development JWT secret)."""

from functools import lru_cache
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_SECRET = "dev-only-insecure-secret-change-me"  # noqa: S105 - rejected outside development


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="DADIP_", env_file=".env", extra="ignore")

    env: Literal["development", "test", "production"] = "development"
    database_url: str = "postgresql+psycopg://dadip:dadip@localhost:5432/dadip"
    redis_url: str = "redis://localhost:6379/0"
    mqtt_host: str = "localhost"
    mqtt_port: int = 1883
    mqtt_username: str | None = None
    mqtt_password: str | None = None

    jwt_secret: str = DEV_SECRET
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 60

    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])
    public_report_rate_per_minute: int = 10
    # Addresses of reverse proxies (e.g. the Next.js frontend) whose X-Forwarded-For header is trusted for the
    # client IP. Empty = never trust the header (a client could forge it to evade rate limits).
    trusted_proxies: list[str] = Field(default_factory=list)
    # Alternative for proxies without fixed addresses (e.g. Vercel functions): the proxy sends this secret in
    # X-DADIP-Proxy-Auth. Unset = disabled.
    proxy_shared_secret: str | None = None

    # Communication channels. A channel is only "real" when its credentials are present.
    telegram_bot_token: str | None = None
    telegram_default_chat_id: str | None = None
    webhook_url: str | None = None
    enabled_channels: list[str] = Field(default_factory=lambda: ["mock_sms", "mock_whatsapp", "websocket", "mqtt"])

    # AURA decision policy
    admissibility_threshold: float = 0.55
    # Alerts at or above this level always need a human approver, whatever AURA decided.
    approval_required_from_level: Literal["green", "yellow", "orange", "red"] = "orange"

    # Optional LLM for AURA chat summaries
    groq_api_key: str | None = None

    @model_validator(mode="after")
    def _reject_dev_secret_in_production(self) -> "Settings":
        if self.env == "production" and self.jwt_secret == DEV_SECRET:
            raise ValueError("DADIP_JWT_SECRET must be set in production")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
