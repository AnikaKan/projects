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
