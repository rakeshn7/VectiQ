"""Vector steering API route."""

import numpy as np
from fastapi import APIRouter, Depends

from app.api.dependencies import get_ready_container
from app.models.schemas import (
    ErrorResponse,
    SteerRequest,
    SteerResponse,
    VectorStateSnapshot,
)
from app.services.container import ServiceContainer

router = APIRouter(tags=["Vector Steering"])


@router.post(
    "/steer",
    response_model=SteerResponse,
    responses={
        400: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
    summary="Steer Sentence Embedding",
    description="Embed input text, apply contrastive vector steering, project into 3D UMAP space, and return neighbors and metrics.",
)
def steer_text(
    payload: SteerRequest,
    container: ServiceContainer = Depends(get_ready_container),
) -> SteerResponse:
    """Execute contrastive vector steering for an input sentence."""
    orig_emb = container.embedding_service.encode_text(payload.text)
    steered_emb = container.steering_service.steer_embedding(
        orig_emb, payload.concept, payload.strength
    )

    if payload.strength == 0.0:
        orig_coords = container.semantic_map_service.transform_vector(orig_emb)
        steered_coords = orig_coords
    else:
        projected = container.semantic_map_service.transform_batch(
            np.stack([orig_emb, steered_emb], axis=0)
        )
        orig_coords, steered_coords = projected[0], projected[1]

    corpus_embeddings = container.semantic_map_service.corpus_embeddings
    corpus_coords = container.semantic_map_service.corpus_coords_3d
    assert corpus_embeddings is not None and corpus_coords is not None

    orig_neighbors = container.similarity_service.find_nearest_neighbors(
        query_embedding=orig_emb,
        records=container.dataset_service.records,
        corpus_embeddings=corpus_embeddings,
        corpus_coords_3d=corpus_coords,
        top_k=payload.top_k_neighbors,
        exclude_text=payload.text,
    )

    if payload.strength == 0.0:
        steered_neighbors = orig_neighbors
    else:
        steered_neighbors = container.similarity_service.find_nearest_neighbors(
            query_embedding=steered_emb,
            records=container.dataset_service.records,
            corpus_embeddings=corpus_embeddings,
            corpus_coords_3d=corpus_coords,
            top_k=payload.top_k_neighbors,
            exclude_text=payload.text,
        )

    movement, preservation, concept_metrics = (
        container.steering_service.compute_comparison_metrics(
            original_embedding=orig_emb,
            steered_embedding=steered_emb,
            original_coords=orig_coords,
            steered_coords=steered_coords,
            concept=payload.concept,
            include_trajectory=payload.include_embeddings,
        )
    )

    orig_emb_out = orig_emb.tolist() if payload.include_embeddings else None
    steered_emb_out = steered_emb.tolist() if payload.include_embeddings else None

    return SteerResponse(
        input_text=payload.text,
        concept=payload.concept,
        strength=payload.strength,
        original=VectorStateSnapshot(
            coordinates=orig_coords,
            concept_score=concept_metrics.original_score,
            nearest_neighbors=orig_neighbors,
            embedding=orig_emb_out,
        ),
        steered=VectorStateSnapshot(
            coordinates=steered_coords,
            concept_score=concept_metrics.steered_score,
            nearest_neighbors=steered_neighbors,
            embedding=steered_emb_out,
        ),
        movement=movement,
        preservation=preservation,
        concept_metrics=concept_metrics,
    )

