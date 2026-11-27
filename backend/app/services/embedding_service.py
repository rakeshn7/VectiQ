"""Embedding generation and vector normalization service using Sentence Transformers."""

from typing import Any, Optional

import numpy as np
from sentence_transformers import SentenceTransformer

from app.core.exceptions import EngineNotReadyError, InvalidInputError
from app.core.logging import get_logger

logger = get_logger(__name__)

NORM_EPSILON = 1e-12


def safe_l2_normalize(vector: np.ndarray) -> np.ndarray:
    """Safely L2-normalize a 1D or 2D vector array as float32 without modifying input."""
    arr = np.array(vector, dtype=np.float32, copy=True)
    if arr.ndim == 1:
        norm = float(np.linalg.norm(arr))
        if norm > NORM_EPSILON:
            arr = (arr / np.float32(norm)).astype(np.float32)
        return arr

    if arr.ndim == 2:
        norms = np.linalg.norm(arr, axis=1, keepdims=True)
        safe_norms = np.where(norms > NORM_EPSILON, norms, 1.0).astype(np.float32)
        normalized = np.where(norms > NORM_EPSILON, arr / safe_norms, arr)
        return normalized.astype(np.float32)

    raise ValueError(f"Expected 1D or 2D vector array, got shape {arr.shape}.")


def safe_cosine_similarity(vec_a: np.ndarray, vec_b: np.ndarray) -> float:
    """Compute cosine similarity safely between two 1D vectors in [-1.0, 1.0]."""
    norm_a = float(np.linalg.norm(vec_a))
    norm_b = float(np.linalg.norm(vec_b))
    if norm_a <= NORM_EPSILON or norm_b <= NORM_EPSILON:
        return 0.0
    similarity = float(np.dot(vec_a, vec_b) / (norm_a * norm_b))
    return float(np.clip(similarity, -1.0, 1.0))


class EmbeddingService:
    """Manages SentenceTransformer model lifecycle and 384D float32 encoding."""

    def __init__(
        self,
        model_name: str,
        expected_dimension: int = 384,
        model: Optional[Any] = None,
    ) -> None:
        self.model_name = model_name
        self.expected_dimension = expected_dimension
        self._model: Optional[Any] = model
        self.max_sequence_length: int = 256

    @property
    def is_loaded(self) -> bool:
        """Return True if an embedding model is loaded in memory."""
        return self._model is not None

    def load_model(self) -> None:
        """Load the SentenceTransformer model once at application startup."""
        if self._model is not None:
            return
        logger.info("Loading embedding model '%s'...", self.model_name)
        try:
            model = SentenceTransformer(self.model_name, local_files_only=True)
            logger.info("Loaded '%s' from local cache.", self.model_name)
        except Exception:
            logger.info(
                "Local cache miss for '%s'; downloading from HuggingFace Hub...",
                self.model_name,
            )
            model = SentenceTransformer(self.model_name)
        max_len = getattr(model, "max_seq_length", None)
        if isinstance(max_len, int) and max_len > 0:
            self.max_sequence_length = max_len
        self._model = model
        logger.info(
            "Embedding model '%s' loaded (max_seq_length=%d).",
            self.model_name,
            self.max_sequence_length,
        )

    def encode_text(self, text: str) -> np.ndarray:
        """Encode a single non-empty text string into an L2-normalized 384D float32 vector."""
        if not isinstance(text, str) or not text.strip():
            raise InvalidInputError(
                "Input text must be a non-empty string.",
                details=[{"field": "text", "issue": "must not be empty", "value": text}],
            )
        vectors = self.encode_batch([text.strip()])
        return np.array(vectors[0], dtype=np.float32, copy=True)

    def encode_batch(self, texts: list[str], batch_size: int = 64) -> np.ndarray:
        """Encode a list of non-empty texts into an L2-normalized (N, 384) float32 array."""
        if self._model is None:
            raise EngineNotReadyError("Embedding model is not loaded yet.")
        if not texts:
            raise InvalidInputError("Cannot encode an empty list of texts.")

        cleaned = [item.strip() for item in texts]
        if any(not item for item in cleaned):
            raise InvalidInputError("All texts in batch must be non-empty.")

        raw = self._model.encode(
            cleaned,
            batch_size=batch_size,
            convert_to_numpy=True,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        arr = np.asarray(raw, dtype=np.float32)
        if arr.ndim == 1:
            arr = arr.reshape(1, -1)

        if arr.shape[1] != self.expected_dimension:
            raise ValueError(
                f"Expected {self.expected_dimension}D embeddings, got {arr.shape[1]}D."
            )

        if not np.all(np.isfinite(arr)):
            raise ValueError("Model generated non-finite embedding values.")

        return safe_l2_normalize(arr)

