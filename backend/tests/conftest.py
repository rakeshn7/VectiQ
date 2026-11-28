"""Shared pytest fixtures for fast deterministic unit tests and real UMAP tests."""

import hashlib
from pathlib import Path

from fastapi.testclient import TestClient
import numpy as np
import pytest

from app.core.config import Settings
from app.main import create_app
from app.models.emotion_schemas import SentimentProbabilities
from app.services.container import ServiceContainer


class FakeSentimentBackend:
    """Fast deterministic sentiment stub for unit/API tests without HF calls."""

    model_name = "fake/sentiment-stub"
    is_loaded = True

    def load(self) -> None:
        self.is_loaded = True

    def predict_batch(self, texts: list[str]) -> list[SentimentProbabilities]:
        out: list[SentimentProbabilities] = []
        for t in texts:
            low = t.lower()
            if "ambiguous" in low or "uncertain" in low:
                out.append(SentimentProbabilities(positive=0.45, neutral=0.40, negative=0.15))
            elif any(w in low for w in ("happy", "joy", "delighted", "love", "great", "warm", "good")):
                out.append(SentimentProbabilities(positive=0.89, neutral=0.07, negative=0.04))
            elif any(w in low for w in ("sad", "angry", "terrible", "broken", "failed", "bad", "miserable")):
                out.append(SentimentProbabilities(positive=0.04, neutral=0.12, negative=0.84))
            else:
                out.append(SentimentProbabilities(positive=0.08, neutral=0.84, negative=0.08))
        return out


class FakeEmotionBackend:
    """Fast deterministic GoEmotions stub for unit/API tests without HF calls."""

    model_name = "fake/go-emotions-stub"
    is_loaded = True

    def load(self) -> None:
        self.is_loaded = True

    def predict_batch(self, texts: list[str]) -> list[dict[str, float]]:
        out: list[dict[str, float]] = []
        for t in texts:
            low = t.lower()
            scores = {
                "joy": 0.03,
                "sadness": 0.03,
                "anger": 0.02,
                "fear": 0.02,
                "surprise": 0.02,
                "disgust": 0.02,
                "love": 0.02,
                "admiration": 0.03,
                "neutral": 0.81,
            }
            if "ambiguous" in low or "uncertain" in low:
                scores = {"neutral": 0.36, "curiosity": 0.31, "joy": 0.14, "sadness": 0.09}
            elif "sad" in low:
                scores.update({"sadness": 0.91, "neutral": 0.03})
            elif any(w in low for w in ("happy", "joy", "delighted", "cheerful")):
                scores.update({"joy": 0.89, "neutral": 0.04})
            elif any(w in low for w in ("love", "adore")):
                scores.update({"love": 0.87, "joy": 0.28, "neutral": 0.04})
            elif any(w in low for w in ("angry", "furious")):
                scores.update({"anger": 0.86, "neutral": 0.05})
            elif any(w in low for w in ("fear", "afraid", "terrified")):
                scores.update({"fear": 0.84, "neutral": 0.06})
            out.append(scores)
        return out


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
    """Initialize full ServiceContainer with deterministic 384D encoder, affect stubs, and real UMAP."""
    container = ServiceContainer(test_settings)
    container.embedding_service._model = DeterministicFakeEmbeddingModel()
    container.affect_analysis_service.sentiment_backend = FakeSentimentBackend()
    container.affect_analysis_service.emotion_backend = FakeEmotionBackend()
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

