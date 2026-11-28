"""FastAPI routes for genuine Sentiment + Multi-Emotion analysis and Human Emotion Corrections."""

from fastapi import APIRouter, Depends

from app.api.dependencies import get_ready_container
from app.core.exceptions import EngineNotReadyError, InvalidInputError
from app.models.emotion_schemas import (
    EmbeddingInfo,
    EmotionAnalyzeRequest,
    EmotionAnalyzeResponse,
    EmotionReviewRequest,
    EmotionReviewResponse,
    EnrichedNeighborItem,
)
from app.models.schemas import Coordinate3D, ErrorResponse
from app.services.container import ServiceContainer

router = APIRouter(prefix="/emotions", tags=["Emotion Analysis & Review"])


def _ensure_affect_ready(container: ServiceContainer) -> None:
    if not container.affect_is_ready:
        raise EngineNotReadyError(
            "Sentiment and multi-emotion classifiers are not initialized."
        )


@router.post(
    "/analyze",
    response_model=EmotionAnalyzeResponse,
    responses={422: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
    summary="Analyze Sentiment & Emotion for Projected Text",
)
def analyze_projected_sentence(
    payload: EmotionAnalyzeRequest,
    container: ServiceContainer = Depends(get_ready_container),
) -> EmotionAnalyzeResponse:
    """Compute genuine 384D embedding, frozen UMAP coords, RoBERTa sentiment, GoEmotions labels, and neighbors."""
    _ensure_affect_ready(container)

    embedding = container.embedding_service.encode_text(payload.text)
    coords = container.semantic_map_service.transform_vector(embedding)
    concept_score = container.steering_service.compute_concept_score(embedding, payload.concept)
    sentiment_pred, emotion_pred = container.affect_analysis_service.analyze_text(payload.text)

    corpus_embeddings = container.semantic_map_service.corpus_embeddings
    corpus_coords = container.semantic_map_service.corpus_coords_3d
    if corpus_embeddings is None or corpus_coords is None:
        raise EngineNotReadyError("Corpus embeddings or UMAP coordinates are not initialized.")

    raw_neighbors = container.similarity_service.find_nearest_neighbors(
        query_embedding=embedding,
        records=container.dataset_service.records,
        corpus_embeddings=corpus_embeddings,
        corpus_coords_3d=corpus_coords,
        top_k=payload.top_k_neighbors,
        exclude_text=payload.text,
    )

    overlays = container.emotion_review_store.list_human_overlays()
    corpus_affect = container.affect_analysis_service.corpus_affect
    enriched: list[EnrichedNeighborItem] = []
    for nn in raw_neighbors:
        meta = corpus_affect.get(nn.id)
        overlay = overlays.get(nn.id)
        enriched.append(
            EnrichedNeighborItem(
                id=nn.id,
                text=nn.text,
                category=nn.category,
                cosine_similarity=nn.cosine_similarity,
                euclidean_distance=nn.euclidean_distance,
                coordinates=nn.coordinates,
                sentiment_label=meta.sentiment_label if meta else None,
                emotion_label=meta.emotion_label if meta else None,
                emotion_raw_label=meta.emotion_raw_label if meta else None,
                emotion_confidence=meta.emotion_confidence if meta else None,
                human_emotion_label=overlay.human_emotion_label if overlay else None,
            )
        )

    record_id, review, created_at = container.emotion_review_store.create_or_get_record(
        record_id=None,
        input_text=payload.text,
        sentiment=sentiment_pred,
        emotion=emotion_pred,
        coordinates=coords,
    )

    return EmotionAnalyzeResponse(
        record_id=record_id,
        input_text=payload.text,
        sentiment=sentiment_pred,
        emotion=emotion_pred,
        embedding_info=EmbeddingInfo(
            model_name=container.embedding_service.model_name,
            dimensions=int(embedding.shape[0]),
            normalized=True,
            umap_coordinates=coords,
            concept=payload.concept,
            concept_score=round(concept_score, 6),
            embedding=embedding.tolist() if payload.include_embeddings else None,
        ),
        nearest_neighbors=enriched,
        review=review,
        created_at=created_at,
    )


@router.post(
    "/reviews",
    response_model=EmotionReviewResponse,
    responses={422: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
    summary="Confirm or Correct Predicted Emotion",
)
def submit_emotion_verification(
    payload: EmotionReviewRequest,
    container: ServiceContainer = Depends(get_ready_container),
) -> EmotionReviewResponse:
    """Persist human confirmation or correction separately without overwriting original prediction or UMAP coords."""
    _ensure_affect_ready(container)

    # Support human verification for both custom projected sentences and reference corpus sentences
    try:
        return container.emotion_review_store.submit_review(
            record_id=payload.record_id,
            action=payload.action,
            human_emotion_label=payload.human_emotion_label,
            rationale=payload.rationale,
        )
    except InvalidInputError:
        corpus_coords = container.semantic_map_service.corpus_coords_3d
        if corpus_coords is None:
            raise EngineNotReadyError("Corpus coordinates are not initialized.")
        for idx, rec in enumerate(container.dataset_service.records):
            if rec.id == payload.record_id:
                sent_pred, emo_pred = container.affect_analysis_service.analyze_text(rec.text)
                coord = corpus_coords[idx]
                container.emotion_review_store.create_or_get_record(
                    record_id=rec.id,
                    input_text=rec.text,
                    sentiment=sent_pred,
                    emotion=emo_pred,
                    coordinates=Coordinate3D(
                        x=round(float(coord[0]), 6),
                        y=round(float(coord[1]), 6),
                        z=round(float(coord[2]), 6),
                    ),
                )
                return container.emotion_review_store.submit_review(
                    record_id=rec.id,
                    action=payload.action,
                    human_emotion_label=payload.human_emotion_label,
                    rationale=payload.rationale,
                )
        raise


@router.get(
    "/reviews/{record_id}",
    response_model=EmotionReviewResponse,
    responses={422: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
    summary="Fetch Human Emotion Review & Audit History",
)
def get_emotion_verification(
    record_id: str,
    container: ServiceContainer = Depends(get_ready_container),
) -> EmotionReviewResponse:
    """Return preserved original prediction, human label overlay, and timestamped correction log."""
    _ensure_affect_ready(container)
    return container.emotion_review_store.get_review(record_id)
