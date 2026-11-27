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
    model_display_name: str = Field(
        default_factory=lambda: os.getenv("MODEL_DISPLAY_NAME", "all-MiniLM-L6-v2")
    )
    embedding_dimension: int = Field(
        default_factory=lambda: int(os.getenv("EMBEDDING_DIMENSION", "384"))
    )
    max_sequence_length: int = Field(
        default_factory=lambda: int(os.getenv("MAX_SEQUENCE_LENGTH", "256"))
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
    umap_dimensions: int = Field(
        default_factory=lambda: int(os.getenv("UMAP_DIMENSIONS", "3"))
    )
    umap_n_neighbors: int = Field(
        default_factory=lambda: int(os.getenv("UMAP_N_NEIGHBORS", "15"))
    )
    umap_min_dist: float = Field(
        default_factory=lambda: float(os.getenv("UMAP_MIN_DIST", "0.1"))
    )
    umap_metric: str = Field(
        default_factory=lambda: os.getenv("UMAP_METRIC", "cosine")
    )
    umap_random_state: int = Field(
        default_factory=lambda: int(os.getenv("UMAP_RANDOM_STATE", "42"))
    )
    default_top_k_neighbors: int = Field(
        default_factory=lambda: int(os.getenv("DEFAULT_TOP_K_NEIGHBORS", "5"))
    )
    log_level: str = Field(
        default_factory=lambda: os.getenv("LOG_LEVEL", "INFO")
    )

    @property
    def cors_origins(self) -> list[str]:
        """Return deduplicated allowed CORS origins."""
        origins = [
            origin.strip().rstrip("/")
            for origin in self.frontend_url.split(",")
            if origin.strip().rstrip("/")
        ]
        for default_origin in ("http://localhost:5173", "http://127.0.0.1:5173"):
            if default_origin not in origins:
                origins.append(default_origin)
        return origins

    @property
    def dataset_path(self) -> Path:
        """Return path to the reference semantic corpus CSV."""
        return self.data_dir / "corpus.csv"


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings instance."""
    return Settings()
