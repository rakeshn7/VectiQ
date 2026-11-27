"""API contract and endpoint behavior tests for VectiQ backend."""

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from app.services.container import ServiceContainer


def test_root_endpoint(client: TestClient) -> None:
    """Verify root metadata endpoint responds properly."""
    response = client.get("/")
    assert response.status_code == 200
    payload = response.json()
    assert payload["service"] == "Semantic Space Studio API"
    assert payload["version"] == "1.0.0"
    assert payload["docs_url"] == "/docs"


def test_health_endpoint_healthy_and_unavailable(test_settings: Settings) -> None:
    """Verify /api/v1/health reports 200 when ready and 503 when uninitialized."""
    unready_container = ServiceContainer(test_settings)
    unready_app = create_app(
        settings=test_settings,
        container=unready_container,
        initialize_on_startup=False,
    )
    with TestClient(unready_app) as unready_client:
        res_503 = unready_client.get("/api/v1/health")
        assert res_503.status_code == 503
        err = res_503.json()["error"]
        assert err["code"] == "SERVICE_UNAVAILABLE"
        assert err["status"] == 503


def test_health_endpoint_ready(client: TestClient) -> None:
    """Verify /api/v1/health conforms to contract when initialized."""
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "healthy"
    assert payload["version"] == "1.0.0"
    assert payload["model_loaded"] is True
    assert payload["umap_fitted"] is True
    assert payload["corpus_size"] >= 300
    assert payload["timestamp"].endswith("Z")


def test_config_endpoint(client: TestClient) -> None:
    """Verify /api/v1/config returns exact model, concept, and UMAP settings."""
    response = client.get("/api/v1/config")
    assert response.status_code == 200
    payload = response.json()
    assert payload["model"]["name"] == "all-MiniLM-L6-v2"
    assert payload["model"]["dimensions"] == 384
    assert payload["model"]["normalized_embeddings"] is True

    assert payload["steering"]["min_strength"] == -1.0
    assert payload["steering"]["max_strength"] == 1.0
    assert payload["steering"]["default_strength"] == 0.0
    concept_ids = [item["id"] for item in payload["steering"]["concepts"]]
    assert concept_ids == ["positive_sentiment", "technical_tone", "formal_tone"]

    assert payload["projection"]["method"] == "UMAP"
    assert payload["projection"]["dimensions"] == 3
    assert payload["projection"]["metric"] == "cosine"


def test_semantic_map_endpoint_filtering_and_embeddings(client: TestClient) -> None:
    """Verify /api/v1/semantic-map pagination, category filter, and embedding toggle."""
    res_default = client.get("/api/v1/semantic-map")
    assert res_default.status_code == 200
    data = res_default.json()
    assert data["total_points"] == 250
    assert len(data["points"]) == 250
    assert len(data["clusters"]) == 6
    assert data["points"][0]["embedding"] is None
    assert {"x", "y", "z"} == set(data["points"][0]["coordinates"].keys())
    assert 0.0 <= data["umap_trustworthiness"] <= 1.0

    res_filtered = client.get(
        "/api/v1/semantic-map",
        params={"category": "technical", "include_embeddings": True, "limit": 10},
    )
    assert res_filtered.status_code == 200
    filtered = res_filtered.json()
    assert filtered["total_points"] == 10
    assert all(pt["category"] == "technical" for pt in filtered["points"])
    assert len(filtered["points"][0]["embedding"]) == 384


def test_steer_endpoint_math_and_zero_strength(client: TestClient) -> None:
    """Verify POST /api/v1/steer across zero, positive, and negative strengths."""
    base_req = {
        "text": "The code runs fast and without any problems.",
        "concept": "technical_tone",
        "top_k_neighbors": 5,
        "include_embeddings": True,
    }

    res_zero = client.post("/api/v1/steer", json={**base_req, "strength": 0.0})
    assert res_zero.status_code == 200
    zero_data = res_zero.json()
    assert len(zero_data["original"]["embedding"]) == 384
    assert zero_data["original"]["embedding"] == zero_data["steered"]["embedding"]
    assert zero_data["original"]["coordinates"] == zero_data["steered"]["coordinates"]
    assert zero_data["preservation"]["semantic_preservation_score"] == 1.0
    assert zero_data["concept_metrics"]["delta"] == 0.0

    res_pos = client.post("/api/v1/steer", json={**base_req, "strength": 0.75})
    res_neg = client.post("/api/v1/steer", json={**base_req, "strength": -0.75})
    assert res_pos.status_code == 200
    assert res_neg.status_code == 200

    pos_data = res_pos.json()
    neg_data = res_neg.json()
    assert pos_data["concept_metrics"]["delta"] > 0
    assert neg_data["concept_metrics"]["delta"] < 0
    assert len(pos_data["original"]["nearest_neighbors"]) == 5
    assert len(pos_data["steered"]["nearest_neighbors"]) == 5
    assert 0.0 < pos_data["preservation"]["semantic_preservation_score"] < 1.0
    assert pos_data["movement"]["euclidean_distance_384d"] > 0.0


def test_steer_endpoint_excludes_embeddings_when_requested(client: TestClient) -> None:
    """Verify include_embeddings=false omits 384D float arrays."""
    res = client.post(
        "/api/v1/steer",
        json={
            "text": "Good morning team.",
            "concept": "formal_tone",
            "strength": 0.5,
            "include_embeddings": False,
        },
    )
    assert res.status_code == 200
    payload = res.json()
    assert payload["original"]["embedding"] is None
    assert payload["steered"]["embedding"] is None
    assert payload["movement"]["trajectory_vector_384d"] is None


def test_evaluate_endpoint(client: TestClient) -> None:
    """Verify POST /api/v1/evaluate returns full trajectory and summary metrics."""
    res = client.post(
        "/api/v1/evaluate",
        json={
            "text": "The system architecture is simple, direct, and fast.",
            "concept": "formal_tone",
            "strengths": [-1.0, -0.5, 0.0, 0.5, 1.0],
            "top_k_neighbors": 5,
        },
    )
    assert res.status_code == 200
    payload = res.json()
    assert len(payload["steps"]) == 5
    assert payload["metrics_summary"]["monotonicity"]["is_monotonic"] is True
    assert payload["metrics_summary"]["monotonicity"]["spearman_correlation"] == 1.0
    assert payload["metrics_summary"]["preservation_retention"]["min_preservation"] > 0.0
    assert 0.0 <= payload["metrics_summary"]["umap_trustworthiness"] <= 1.0


def test_validation_and_error_envelopes(client: TestClient) -> None:
    """Verify invalid requests return standardized ErrorResponse payloads."""
    res_empty = client.post(
        "/api/v1/steer",
        json={"text": "   ", "concept": "positive_sentiment", "strength": 0.5},
    )
    assert res_empty.status_code == 422
    assert res_empty.json()["error"]["code"] == "VALIDATION_ERROR"

    res_bounds = client.post(
        "/api/v1/steer",
        json={"text": "Valid sentence.", "concept": "positive_sentiment", "strength": 1.5},
    )
    assert res_bounds.status_code == 422
    assert res_bounds.json()["error"]["status"] == 422

    res_concept = client.post(
        "/api/v1/steer",
        json={"text": "Valid sentence.", "concept": "unknown_axis", "strength": 0.2},
    )
    assert res_concept.status_code == 422

    res_bad_json = client.post(
        "/api/v1/steer",
        content="{invalid-json",
        headers={"Content-Type": "application/json"},
    )
    assert res_bad_json.status_code == 400
    assert res_bad_json.json()["error"]["code"] == "BAD_REQUEST"


def test_cors_allows_frontend_origin(client: TestClient) -> None:
    """Verify CORS allows requests from http://localhost:5173."""
    response = client.options(
        "/api/v1/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_cors_normalizes_configured_frontend_urls(test_settings: Settings) -> None:
    """Verify FRONTEND_URL supports comma-separated origins and trailing slashes."""
    prod_settings = test_settings.model_copy(
        update={
            "frontend_url": "https://vectiq-demo.up.railway.app/, https://custom.vectiq.app"
        }
    )
    assert "https://vectiq-demo.up.railway.app" in prod_settings.cors_origins
    assert "https://custom.vectiq.app" in prod_settings.cors_origins
    assert "http://localhost:5173" in prod_settings.cors_origins
    assert "http://127.0.0.1:5173" in prod_settings.cors_origins

    prod_app = create_app(settings=prod_settings, initialize_on_startup=False)
    with TestClient(prod_app) as prod_client:
        response = prod_client.options(
            "/api/v1/health",
            headers={
                "Origin": "https://vectiq-demo.up.railway.app",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert response.status_code == 200
        assert (
            response.headers.get("access-control-allow-origin")
            == "https://vectiq-demo.up.railway.app"
        )
