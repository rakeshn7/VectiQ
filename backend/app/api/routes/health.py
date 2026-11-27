"""Health-check API route."""

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from app.api.dependencies import get_container
from app.core.exceptions import build_error_payload, utc_timestamp_iso
from app.models.schemas import ErrorResponse, HealthResponse
from app.services.container import ServiceContainer

router = APIRouter(tags=["Health"])


@router.get(
    "/health",
    response_model=HealthResponse,
    responses={503: {"model": ErrorResponse}},
    summary="Health Check",
    description="Verify backend readiness, model load status, and UMAP initialization.",
)
def health_check(
    container: ServiceContainer = Depends(get_container),
) -> HealthResponse | JSONResponse:
    """Return operational readiness of the FastAPI app, model, and UMAP pipeline."""
    model_loaded = container.embedding_service.is_loaded
    umap_fitted = container.semantic_map_service.is_fitted
    steering_ready = container.steering_service.is_ready
    corpus_size = container.dataset_service.size

    if container.startup_error or not (model_loaded and umap_fitted and steering_ready):
        message = (
            container.startup_error
            or "Embedding model or UMAP projection pipeline failed to initialize."
        )
        payload = build_error_payload(
            code="SERVICE_UNAVAILABLE",
            message=message,
            status_code=503,
            details=[
                {"field": "model_loaded", "issue": "readiness", "value": model_loaded},
                {"field": "umap_fitted", "issue": "readiness", "value": umap_fitted},
                {"field": "steering_ready", "issue": "readiness", "value": steering_ready},
            ],
        )
        return JSONResponse(status_code=503, content=payload)

    status_value = "healthy" if corpus_size > 0 else "degraded"
    return HealthResponse(
        status=status_value,
        version=container.settings.app_version,
        model_loaded=model_loaded,
        umap_fitted=umap_fitted,
        corpus_size=corpus_size,
        timestamp=utc_timestamp_iso(),
    )

