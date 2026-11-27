"""Foundation API tests for Semantic Space Studio backend."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_app_metadata() -> None:
    """Verify FastAPI application metadata is configured."""
    assert app.title == "Semantic Space Studio API"
    assert app.version == "1.0.0"


def test_root_endpoint() -> None:
    """Verify root endpoint responds with expected payload."""
    response = client.get("/")
    assert response.status_code == 200
    payload = response.json()
    assert payload == {
        "message": "Semantic Space Studio API is running.",
        "service": "Semantic Space Studio API",
        "version": "1.0.0",
        "docs_url": "/docs",
    }


def test_health_check_endpoint() -> None:
    """Verify health-check endpoint returns HTTP 200 and expected structure."""
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["service"] == "Semantic Space Studio API"
    assert payload["version"] == "1.0.0"
    assert isinstance(payload["environment"], str)
    assert len(payload["environment"]) > 0


def test_cors_allows_frontend_origin() -> None:
    """Verify CORS headers allow requests from the configured frontend origin."""
    response = client.options(
        "/api/v1/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"

