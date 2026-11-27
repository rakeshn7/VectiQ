"""Shared pytest fixtures for fast deterministic unit tests and real UMAP tests."""

import hashlib
from pathlib import Path

from fastapi.testclient import TestClient
import numpy as np
import pytest

from app.core.config import Settings
from app.main import create_app
from app.services.container import ServiceContainer


class DeterministicFakeEmbeddingModel:
    """Fast deterministic 384D embedding model stub for unit tests without HF downloads."""

    max_seq_length = 256

    _CONCEPT_HINTS = {
        0: ("delighted", "joy", "warm", "wonderful", "happy", "great", "good", "excellent", "optimistic", "bright", "positive", "cheerful", "grateful"),
        1: ("regressions", "frustrated", "exhausted", "miserable", "broken", "angry", "bad", "terrible", "outage", "rude", "painful", "negative", "unbearable"),
        2: ("consensus", "distributed", "backpropagation", "cosine", "eigenvalue", "quantized", "transformer", "matrix", "umap", "algorithm", "latency", "float32", "vector"),
        3: ("basically", "kinda", "little", "thing", "slows", "freezes", "eyeball", "stuff", "simple", "box", "button", "chat", "tweak"),
        4: ("hereby", "pursuant", "accordance", "respectfully", "notwithstanding", "shall", "arbitration", "statutory", "audit", "committee", "enclosed", "memorandum"),
        5: ("hey", "gonna", "yeah", "lol", "dude", "yo", "grab", "chill", "ping", "tacos", "pizza", "oops", "totally"),
    }

    def encode(
        self,
        texts: list[str],
        batch_size: int = 64,
        convert_to_numpy: bool = True,
        normalize_embeddings: bool = True,
        show_progress_bar: bool = False,
    ) -> np.ndarray:
        vectors = np.zeros((len(texts), 384), dtype=np.float32)
        for row_idx, text in enumerate(texts):
            lowered = text.lower()
            digest = hashlib.sha256(lowered.encode("utf-8")).digest()
            seed = int.from_bytes(digest[:4], "little")
            rng = np.random.default_rng(seed)
            vec = rng.normal(0.0, 0.25, size=384).astype(np.float32)

            # Add structured semantic signal along dedicated subspaces so concept poles separate cleanly
            for dim_block, keywords in self._CONCEPT_HINTS.items():
                hits = sum(1 for kw in keywords if kw in lowered)
                if hits:
                    start = dim_block * 12
                    vec[start : start + 12] += np.float32(1.4 * hits)

            if normalize_embeddings:
                norm = float(np.linalg.norm(vec))
                if norm > 1e-12:
                    vec = (vec / np.float32(norm)).astype(np.float32)
            vectors[row_idx] = vec
        return vectors


@pytest.fixture(scope="session")
def test_settings(tmp_path_factory: pytest.TempPathFactory) -> Settings:
    """Create isolated settings pointing to real dataset and temp artifact cache."""
    backend_dir = Path(__file__).resolve().parent.parent
    artifacts_dir = tmp_path_factory.mktemp("test_artifacts")
    return Settings(
        data_dir=backend_dir / "data",
        artifacts_dir=artifacts_dir,
        environment="test",
    )


@pytest.fixture(scope="session")
def initialized_container(test_settings: Settings) -> ServiceContainer:
    """Initialize full ServiceContainer with deterministic 384D encoder and real UMAP."""
    container = ServiceContainer(test_settings)
    container.embedding_service._model = DeterministicFakeEmbeddingModel()
    container.initialize(save_artifacts=True)
    return container


@pytest.fixture()
def client(test_settings: Settings, initialized_container: ServiceContainer) -> TestClient:
    """Return TestClient wired to the initialized test container."""
    app = create_app(
        settings=test_settings,
        container=initialized_container,
        initialize_on_startup=False,
    )
    with TestClient(app) as test_client:
        yield test_client

