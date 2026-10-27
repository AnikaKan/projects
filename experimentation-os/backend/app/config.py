from enum import StrEnum

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class RuntimeEnvironment(StrEnum):
    LOCAL = "local"
    TEST = "test"
    STAGING = "staging"
    PRODUCTION = "production"


class AuthMode(StrEnum):
    LOCAL = "local"
    OIDC = "oidc"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: RuntimeEnvironment = Field(
        default=RuntimeEnvironment.LOCAL, alias="EXPERIMENTOS_ENVIRONMENT"
    )
    auth_mode: AuthMode = Field(default=AuthMode.LOCAL, alias="AUTH_MODE")
    database_url: str = Field(
        default="postgresql+psycopg://experimentos:experimentos@localhost:5432/experimentos",
        alias="DATABASE_URL",
    )
    credential_pepper: str = Field(
        default="local-development-pepper-not-for-production-0001",
        alias="CREDENTIAL_PEPPER",
        min_length=32,
    )
    oidc_issuer: str | None = Field(default=None, alias="OIDC_ISSUER")
    oidc_audience: str | None = Field(default=None, alias="OIDC_AUDIENCE")
    oidc_jwks_url: str | None = Field(default=None, alias="OIDC_JWKS_URL")
    sqs_endpoint_url: str | None = Field(default=None, alias="SQS_ENDPOINT_URL")
    sqs_region: str = Field(default="us-west-2", alias="AWS_REGION")
    event_queue_name: str = Field(default="experimentos-events", alias="EVENT_QUEUE_NAME")
    event_dlq_name: str = Field(default="experimentos-events-dlq", alias="EVENT_DLQ_NAME")
    event_max_receive_count: int = Field(default=5, ge=2, le=20, alias="EVENT_MAX_RECEIVE_COUNT")
    event_visibility_timeout_seconds: int = Field(
        default=30, ge=5, le=900, alias="EVENT_VISIBILITY_TIMEOUT_SECONDS"
    )
    event_max_age_days: int = Field(default=90, ge=1, le=365, alias="EVENT_MAX_AGE_DAYS")
    event_max_future_seconds: int = Field(
        default=300, ge=0, le=3600, alias="EVENT_MAX_FUTURE_SECONDS"
    )
    event_queue_age_alert_seconds: int = Field(
        default=60, ge=1, le=86_400, alias="EVENT_QUEUE_AGE_ALERT_SECONDS"
    )
    event_reconciliation_delay_alert_seconds: int = Field(
        default=120, ge=1, le=86_400, alias="EVENT_RECONCILIATION_DELAY_ALERT_SECONDS"
    )
    request_concurrency_limit: int = Field(
        default=64, ge=1, le=10_000, alias="REQUEST_CONCURRENCY_LIMIT"
    )
    request_slow_alert_milliseconds: int = Field(
        default=500, ge=1, le=60_000, alias="REQUEST_SLOW_ALERT_MILLISECONDS"
    )

    @model_validator(mode="after")
    def reject_development_auth_in_managed_environments(self) -> "Settings":
        managed = self.environment in {
            RuntimeEnvironment.STAGING,
            RuntimeEnvironment.PRODUCTION,
        }
        if managed and self.auth_mode is AuthMode.LOCAL:
            raise ValueError("local authentication is forbidden in staging and production")
        if self.auth_mode is AuthMode.OIDC and not all(
            (self.oidc_issuer, self.oidc_audience, self.oidc_jwks_url)
        ):
            raise ValueError("OIDC_ISSUER, OIDC_AUDIENCE, and OIDC_JWKS_URL are required")
        if managed and self.credential_pepper.startswith("local-development-"):
            raise ValueError("the local credential pepper is forbidden in managed environments")
        return self
