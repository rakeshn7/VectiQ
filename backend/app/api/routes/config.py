"""Configuration metadata API route."""

from fastapi import APIRouter, Depends

from app.api.dependencies import get_container
from app.models.schemas import (
    ConfigResponse,
    ModelConfigMetadata,
    ProjectionConfigMetadata,
    SteeringConfigMetadata,
)
from app.services.container import ServiceContainer
from app.services.steering_service import CONCEPT_CATALOG

router = APIRouter(tags=["Configuration"])


@router.get(
    "/config",
    response_model=ConfigResponse,
    summary="Get System Configuration",
    description="Return active model, steering concepts, strength bounds, and UMAP projection settings.",
)
def get_config(
    container: ServiceContainer = Depends(get_container),
) -> ConfigResponse:
    """Return model, steering, and UMAP projection configuration."""
    settings = container.settings
    return ConfigResponse(
        model=ModelConfigMetadata(
            name=settings.model_display_name,
            dimensions=settings.embedding_dimension,
            max_sequence_length=container.embedding_service.max_sequence_length,
            normalized_embeddings=True,
        ),
        steering=SteeringConfigMetadata(
            min_strength=-1.0,
            max_strength=1.0,
            default_strength=0.0,
            step=0.05,
            concepts=CONCEPT_CATALOG,
        ),
        projection=ProjectionConfigMetadata(
            method="UMAP",
            dimensions=settings.umap_dimensions,
            n_neighbors=settings.umap_n_neighbors,
            min_dist=settings.umap_min_dist,
            metric=settings.umap_metric,
        ),
    )

