"""Centralized application configuration loaded from environment variables."""

from functools import lru_cache
import os
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent.parent.parent
load_dotenv(BASE_DIR / ".env")


class Settings(BaseModel):
    """Application settings for Semantic Space Studio API."""

    app_name: str = Field(
        default_factory=lambda: os.getenv("APP_NAME", "Semantic Space Studio API")
    )
    app_version: str = Field(
        default_factory=lambda: os.getenv("APP_VERSION", "1.0.0")
    )
    environment: str = Field(
        default_factory=lambda: os.getenv("ENVIRONMENT", "development")
    )
    model_name: str = Field(
        default_factory=lambda: os.getenv(
            "MODEL_NAME", "sentence-transformers/all-MiniLM-L6-v2"
        )
    )
    embedding_dimension: int = Field(
        default_factory=lambda: int(os.getenv("EMBEDDING_DIMENSION", "384"))
    )
    frontend_url: str = Field(
        default_factory=lambda: os.getenv("FRONTEND_URL", "http://localhost:5173")
    )
    data_dir: Path = Field(
        default_factory=lambda: Path(os.getenv("DATA_DIR", str(BASE_DIR / "data")))
    )
    artifacts_dir: Path = Field(
        default_factory=lambda: Path(
            os.getenv("ARTIFACTS_DIR", str(BASE_DIR / "artifacts"))
        )
    )

    @property
    def cors_origins(self) -> list[str]:
        """Return deduplicated allowed CORS origins."""
        origins = [
            origin.strip()
            for origin in self.frontend_url.split(",")
            if origin.strip()
        ]
        if "http://localhost:5173" not in origins:
            origins.append("http://localhost:5173")
        return origins


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings instance."""
    return Settings()

