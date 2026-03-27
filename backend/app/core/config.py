"""
Application Configuration
=========================
All settings for the Attendance & Payroll Management Platform.

SECURITY NOTE:
- In production, set SECRET_KEY via environment variable
- Never commit real secrets to version control
- Use strong, random keys (minimum 32 characters)
"""

import secrets
from pydantic_settings import BaseSettings
from typing import Optional
from functools import lru_cache


def _generate_secret_key() -> str:
    """Generate a secure random secret key for development."""
    return secrets.token_urlsafe(32)


class Settings(BaseSettings):
    """Application settings."""

    # App Info
    APP_NAME: str = "Attendance & Payroll Management"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    ENVIRONMENT: str = "development"  # development, staging, production

    # Server - Accessible from network
    HOST: str = "0.0.0.0"  # Bind to all interfaces
    PORT: int = 8000
    SSL_CERTFILE: str = "../certs/cert.pem"
    SSL_KEYFILE: str = "../certs/key.pem"

    # Database - Using SQLite for easy local development
    DATABASE_URL: str = "sqlite:///./attendance_payroll.db"

    # JWT Settings - SECRET_KEY should be set via environment variable in production
    # If not set, generates a random key (tokens won't persist across restarts)
    SECRET_KEY: str = ""  # Set via SECRET_KEY env var
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 8  # 8 hours for workday
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Generate secret key if not provided
        if not self.SECRET_KEY:
            import warnings
            if self.ENVIRONMENT == "production":
                raise ValueError(
                    "SECRET_KEY must be set via environment variable in production! "
                    "Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(32))\""
                )
            self.SECRET_KEY = _generate_secret_key()
            warnings.warn(
                "SECRET_KEY not set - using auto-generated key. "
                "Sessions will not persist across restarts. "
                "Set SECRET_KEY in .env for persistent sessions.",
                UserWarning
            )

    # Password Policy Defaults (HR can change these)
    PASSWORD_MIN_LENGTH: int = 8
    PASSWORD_REQUIRE_UPPERCASE: bool = True
    PASSWORD_REQUIRE_NUMBERS: bool = True
    PASSWORD_REQUIRE_SPECIAL: bool = True
    PASSWORD_EXPIRY_DAYS: int = 90  # Password expires after 90 days

    # CORS Settings
    CORS_ORIGINS: str = "*"  # Comma-separated origins, or "*" for all (local network)
    CORS_ALLOW_CREDENTIALS: bool = True

    # File Upload
    MAX_UPLOAD_SIZE_MB: int = 50
    ALLOWED_EXTENSIONS: list = [".xls", ".xlsx", ".csv"]
    UPLOAD_DIR: str = "uploads"

    # Audit Log
    AUDIT_LOG_RETENTION_DAYS: int = 365 * 7  # 7 years

    # Email Configuration (Gmail SMTP)
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None  # Gmail address
    SMTP_PASSWORD: Optional[str] = None  # Gmail App Password
    SMTP_FROM_NAME: str = "ICAN A&P System"
    SMTP_FROM_EMAIL: Optional[str] = None  # Defaults to SMTP_USER
    EMAIL_ENABLED: bool = False  # Set to True when configured

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


settings = get_settings()
