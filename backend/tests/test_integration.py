"""Integration tests exercising the real sentence-transformers/all-MiniLM-L6-v2 pipeline."""

from fastapi.testclient import TestClient
import numpy as np
import pytest

from app.core.config import get_settings
from app.main import create_app


@pytest.mark.integration
def test_real_model_end_to_end_pipeline() -> None:
    """Boot the real FastAPI app with all-MiniLM-L6-v2 and verify real ML behavior."""
    settings = get_settings()
    app = create_app(settings=settings, initialize_on_startup=True)

    with TestClient(app) as client:
        health_res = client.get("/api/v1/health")
        assert health_res.status_code == 200
        health = health_res.json()
        assert health["status"] == "healthy"
        assert health["model_loaded"] is True
        assert health["umap_fitted"] is True
        assert health["corpus_size"] == 360

        map_res = client.get("/api/v1/semantic-map", params={"limit": 360})
        assert map_res.status_code == 200
        semantic_map = map_res.json()
        assert semantic_map["total_points"] == 360
        assert semantic_map["umap_trustworthiness"] > 0.7

        steer_pos = client.post(
            "/api/v1/steer",
            json={
                "text": "The software update arrived on schedule.",
                "concept": "positive_sentiment",
                "strength": 0.65,
                "top_k_neighbors": 5,
                "include_embeddings": True,
            },
        )
        assert steer_pos.status_code == 200
        pos_data = steer_pos.json()
        orig_vec = np.asarray(pos_data["original"]["embedding"], dtype=np.float32)
        steered_vec = np.asarray(pos_data["steered"]["embedding"], dtype=np.float32)
        assert orig_vec.shape == (384,)
        assert steered_vec.shape == (384,)
        assert np.isclose(np.linalg.norm(orig_vec), 1.0, atol=1e-4)
        assert np.isclose(np.linalg.norm(steered_vec), 1.0, atol=1e-4)
        assert pos_data["concept_metrics"]["delta"] > 0.0

        eval_res = client.post(
            "/api/v1/evaluate",
            json={
                "text": "The code runs fast and works reliably.",
                "concept": "technical_tone",
                "strengths": [-1.0, -0.5, 0.0, 0.5, 1.0],
                "top_k_neighbors": 5,
            },
        )
        assert eval_res.status_code == 200
        eval_data = eval_res.json()
        assert eval_data["metrics_summary"]["monotonicity"]["is_monotonic"] is True
        assert eval_data["metrics_summary"]["monotonicity"]["spearman_correlation"] == 1.0

