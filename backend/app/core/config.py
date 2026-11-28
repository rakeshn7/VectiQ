"""Centralized application configuration loaded from environment variables."""

from functools import lru_cache
import json
import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent.parent.parent
load_dotenv(BASE_DIR / ".env")


def _parse_origin_list(raw_value: str) -> list[str]:
    """Parse comma-separated or JSON-array origin strings and strip trailing slashes."""
    text = raw_value.strip()
    if not text:
        return []

    candidates: list[str]
    if text.startswith("["):
        try:
            loaded = json.loads(text)
            if isinstance(loaded, list):
                candidates = [str(item) for item in loaded]
            else:
                candidates = text.split(",")
        except json.JSONDecodeError:
            candidates = text.split(",")
    else:
        candidates = text.split(",")

    normalized: list[str] = []
    for item in candidates:
        cleaned = item.strip().strip("\"'").rstrip("/")
        if cleaned and cleaned != "*":
            normalized.append(cleaned)
    return normalized


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
        default_factory=lambda: os.getenv("FRONTEND_URL", "")
    )
    cors_origins_raw: str = Field(
        default_factory=lambda: os.getenv("CORS_ORIGINS", "")
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
    sentiment_model_name: str = Field(
        default_factory=lambda: os.getenv(
            "SENTIMENT_MODEL_NAME",
            "cardiffnlp/twitter-roberta-base-sentiment-latest",
        )
    )
    emotion_model_name: str = Field(
        default_factory=lambda: os.getenv(
            "EMOTION_MODEL_NAME",
            "SamLowe/roberta-base-go_emotions",
        )
    )
    sentiment_uncertainty_prob_threshold: float = Field(
        default_factory=lambda: float(
            os.getenv("SENTIMENT_UNCERTAINTY_PROB_THRESHOLD", "0.60")
        )
    )
    sentiment_uncertainty_margin_threshold: float = Field(
        default_factory=lambda: float(
            os.getenv("SENTIMENT_UNCERTAINTY_MARGIN_THRESHOLD", "0.15")
        )
    )
    emotion_uncertainty_prob_threshold: float = Field(
        default_factory=lambda: float(
            os.getenv("EMOTION_UNCERTAINTY_PROB_THRESHOLD", "0.45")
        )
    )
    emotion_reviews_db_path_override: Optional[str] = Field(
        default_factory=lambda: os.getenv("EMOTION_REVIEWS_DB_PATH") or None
    )
    log_level: str = Field(
        default_factory=lambda: os.getenv("LOG_LEVEL", "INFO")
    )

    @property
    def is_production(self) -> bool:
        """Return True when running in production environment."""
        return self.environment.strip().lower() == "production"

    @property
    def cors_origins(self) -> list[str]:
        """Return deduplicated allowed CORS origins without leaking localhost in production."""
        origins: list[str] = []
        for candidate in (
            *_parse_origin_list(self.frontend_url),
            *_parse_origin_list(self.cors_origins_raw),
        ):
            if candidate not in origins:
                origins.append(candidate)

        if not self.is_production:
            for default_origin in ("http://localhost:5173", "http://127.0.0.1:5173"):
                if default_origin not in origins:
                    origins.append(default_origin)
        return origins

    @property
    def dataset_path(self) -> Path:
        """Return path to the reference semantic corpus CSV."""
        return self.data_dir / "corpus.csv"

    @property
    def emotion_reviews_db_path(self) -> Path:
        """Return path to SQLite DB storing human emotion confirmations and corrections."""
        if self.emotion_reviews_db_path_override:
            return Path(self.emotion_reviews_db_path_override)
        return self.artifacts_dir / "emotion_reviews.db"


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings instance."""
    return Settings()
