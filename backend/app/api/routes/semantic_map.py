"""Semantic map API route."""

from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query

from app.api.dependencies import get_ready_container
from app.models.schemas import ErrorResponse, SemanticMapResponse
from app.services.container import ServiceContainer

router = APIRouter(tags=["Semantic Map"])


@router.get(
    "/semantic-map",
    response_model=SemanticMapResponse,
    responses={503: {"model": ErrorResponse}},
    summary="Get Reference Semantic Map",
    description="Return precomputed 3D UMAP reference corpus points, cluster summaries, and bounds.",
)
def get_semantic_map(
    include_embeddings: bool = Query(
        False,
        description="Include raw 384D embeddings in each point payload.",
    ),
    category: Optional[str] = Query(
        None,
        description="Optional semantic cluster category filter.",
    ),
    sentiment: Optional[str] = Query(
        None,
        description="Optional sentiment polarity filter (positive, neutral, negative, mixed, uncertain).",
    ),
    emotion: Optional[str] = Query(
        None,
        description="Optional emotion filter (joy, sadness, anger, fear, surprise, disgust, love, neutral, other, uncertain).",
    ),
    label_mode: Literal["human", "model"] = Query(
        "human",
        description="Whether emotion and sentiment filters use Human-Confirmed Results ('human', default) or AI Model Predictions ('model').",
    ),
    search: Optional[str] = Query(
        None,
        description="Optional case-insensitive text, ID, category, or emotion substring filter.",
    ),
    limit: int = Query(
        250,
        ge=1,
        le=1000,
        description="Maximum number of corpus points to return.",
    ),
    container: ServiceContainer = Depends(get_ready_container),
) -> SemanticMapResponse:
    """Return precomputed semantic space corpus nodes and bounds."""
    overlays = container.emotion_review_store.list_human_overlays()
    return container.semantic_map_service.get_semantic_map(
        records=container.dataset_service.records,
        include_embeddings=include_embeddings,
        category=category,
        sentiment=sentiment,
        emotion=emotion,
        label_mode=label_mode,
        search=search,
        limit=limit,
        corpus_affect=container.affect_analysis_service.corpus_affect,
        human_overlays=overlays,
    )

