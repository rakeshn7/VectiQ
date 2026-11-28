"""Production configuration, CORS, and persistent volume tests for Railway deployment."""

from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from app.services.container import ServiceContainer
from tests.conftest import (
    DeterministicFakeEmbeddingModel,
    FakeEmotionBackend,
    FakeSentimentBackend,
)


def _wire_fake_models(container: ServiceContainer) -> None:
    container.embedding_service._model = DeterministicFakeEmbeddingModel()
    container.affect_analysis_service.sentiment_backend = FakeSentimentBackend()
    container.affect_analysis_service.emotion_backend = FakeEmotionBackend()


def test_production_cors_excludes_localhost_and_honors_env_lists(
    test_settings: Settings,
) -> None:
    """In production, localhost defaults are excluded and CORS_ORIGINS / FRONTEND_URL are normalized."""
    bare_prod = Settings(
        data_dir=test_settings.data_dir,
        artifacts_dir=test_settings.artifacts_dir,
        environment="production",
        frontend_url="",
        cors_origins_raw="",
    )
    assert bare_prod.is_production is True
    assert bare_prod.cors_origins == []

    configured_prod = Settings(
        data_dir=test_settings.data_dir,
        artifacts_dir=test_settings.artifacts_dir,
        environment="production",
        frontend_url="https://vectiq-web.up.railway.app/, *",
        cors_origins_raw='["https://custom.vectiq.app/", "https://vectiq-web.up.railway.app"]',
    )
    assert configured_prod.cors_origins == [
        "https://vectiq-web.up.railway.app",
        "https://custom.vectiq.app",
    ]
    assert "http://localhost:5173" not in configured_prod.cors_origins
    assert "http://127.0.0.1:5173" not in configured_prod.cors_origins

    prod_app = create_app(settings=configured_prod, initialize_on_startup=False)
    with TestClient(prod_app) as prod_client:
        allowed_res = prod_client.options(
            "/api/v1/health",
            headers={
                "Origin": "https://vectiq-web.up.railway.app",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert allowed_res.status_code == 200
        assert (
            allowed_res.headers.get("access-control-allow-origin")
            == "https://vectiq-web.up.railway.app"
        )

        rejected_local = prod_client.options(
            "/api/v1/health",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert rejected_local.headers.get("access-control-allow-origin") is None


def test_volume_artifact_persistence_across_restarts_and_db_override(
    tmp_path: Path,
) -> None:
    """Verify fitted UMAP artifacts and SQLite reviews DB persist on separate volume paths."""
    backend_dir = Path(__file__).resolve().parent.parent
    volume_root = tmp_path / "data"
    artifacts_dir = volume_root / "artifacts"
    db_path = volume_root / "db" / "emotion_reviews.db"

    vol_settings = Settings(
        data_dir=backend_dir / "data",
        artifacts_dir=artifacts_dir,
        environment="production",
        frontend_url="https://vectiq-web.up.railway.app",
        emotion_reviews_db_path_override=str(db_path),
    )

    first_container = ServiceContainer(vol_settings)
    _wire_fake_models(first_container)
    first_container.initialize(save_artifacts=True)

    assert (artifacts_dir / "manifest.json").exists()
    assert (artifacts_dir / "corpus_embeddings.npy").exists()
    assert (artifacts_dir / "corpus_coords_3d.npy").exists()
    assert (artifacts_dir / "umap_model.joblib").exists()
    assert (artifacts_dir / "corpus_affect_cache_v1.json").exists()
    assert db_path.exists()

    second_container = ServiceContainer(vol_settings)
    _wire_fake_models(second_container)
    with patch.object(
        second_container.semantic_map_service,
        "fit_and_save",
        side_effect=AssertionError("UMAP must reuse persisted artifacts on restart"),
    ):
        second_container.initialize(save_artifacts=True)

    assert second_container.is_ready is True
    assert second_container.affect_is_ready is True

    # Verify graceful regeneration if manifest JSON is corrupted
    (artifacts_dir / "manifest.json").write_text("{corrupt-json", encoding="utf-8")
    repaired_container = ServiceContainer(vol_settings)
    _wire_fake_models(repaired_container)
    repaired_container.initialize(save_artifacts=True)
    assert repaired_container.is_ready is True
    assert not (artifacts_dir / "manifest.json.tmp").exists()
