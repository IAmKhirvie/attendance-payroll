"""
Application Configuration
=========================
All settings for the Attendance & Payroll Management Platform.
"""

from pydantic_settings import BaseSettings
from typing import Optional
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings."""

    # App Info
    APP_NAME: str = "Attendance & Payroll Management"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    # Server - Accessible from network
    HOST: str = "0.0.0.0"  # Bind to all interfaces
    PORT: int = 8000
    SSL_CERTFILE: str = "../certs/cert.pem"
    SSL_KEYFILE: str = "../certs/key.pem"

    # Database - Using SQLite for easy local development
    DATABASE_URL: str = "sqlite:///./attendance_payroll.db"

    # JWT Settings
    SECRET_KEY: str = "your-super-secret-key-change-in-production-min-32-chars"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 8  # 8 hours for workday
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Password Policy Defaults (HR can change these)
    PASSWORD_MIN_LENGTH: int = 6
    PASSWORD_REQUIRE_UPPERCASE: bool = False
    PASSWORD_REQUIRE_NUMBERS: bool = False
    PASSWORD_REQUIRE_SPECIAL: bool = False
    PASSWORD_EXPIRY_DAYS: int = 0  # 0 = no expiry

    # File Upload
    MAX_UPLOAD_SIZE_MB: int = 50
    ALLOWED_EXTENSIONS: list = [".xls", ".xlsx", ".csv"]
    UPLOAD_DIR: str = "uploads"

    # Audit Log
    AUDIT_LOG_RETENTION_DAYS: int = 365 * 7  # 7 years

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


settings = get_settings()
