"""Unit tests for VectiQ dataset, embedding, steering, UMAP, similarity, and evaluation services."""

from pathlib import Path

import numpy as np
import pytest

from app.core.exceptions import InvalidInputError
from app.models.schemas import ConceptEnum
from app.services.container import ServiceContainer
from app.services.dataset_service import DatasetService
from app.services.embedding_service import EmbeddingService, safe_l2_normalize
from app.services.semantic_map_service import SemanticMapService


def test_dataset_validity_and_anchors() -> None:
    """Verify reference corpus size (300-500), uniqueness, and anchor balance."""
    dataset_path = Path(__file__).resolve().parent.parent / "data" / "corpus.csv"
    service = DatasetService(dataset_path)
    records = service.load()

    assert 300 <= len(records) <= 500
    assert len({r.id for r in records}) == len(records)
    assert len({r.text.casefold() for r in records}) == len(records)

    for concept in ConceptEnum:
        pos_idx, neg_idx = service.get_concept_anchor_indices(concept)
        assert len(pos_idx) >= 20
        assert len(neg_idx) >= 20


def test_safe_l2_normalize_handles_zero_norm() -> None:
    """Verify zero-norm vectors never produce NaNs or division errors."""
    zero_vec = np.zeros(384, dtype=np.float32)
    normalized = safe_l2_normalize(zero_vec)
    assert normalized.shape == (384,)
    assert normalized.dtype == np.float32
    assert np.all(np.isfinite(normalized))
    assert np.allclose(normalized, 0.0)


def test_embedding_service_dimension_and_validation(
    initialized_container: ServiceContainer,
) -> None:
    """Verify embeddings are normalized 384D float32 arrays and reject empty text."""
    emb = initialized_container.embedding_service.encode_text(
        "Distributed systems improve reliability."
    )
    assert emb.shape == (384,)
    assert emb.dtype == np.float32
    assert np.isclose(np.linalg.norm(emb), 1.0, atol=1e-5)

    with pytest.raises(InvalidInputError):
        initialized_container.embedding_service.encode_text("   ")


def test_steering_preserves_original_and_moves_oppositely(
    initialized_container: ServiceContainer,
) -> None:
    """Verify zero-strength identity, original immutability, and opposite polarity shifts."""
    orig = initialized_container.embedding_service.encode_text(
        "The software update arrived on time."
    )
    orig_snapshot = orig.copy()

    # Zero strength preserves exact vector
    steered_zero = initialized_container.steering_service.steer_embedding(
        orig, ConceptEnum.positive_sentiment, 0.0
    )
    assert np.array_equal(orig, orig_snapshot)
    assert np.allclose(steered_zero, orig, atol=1e-7)

    # Positive and negative steering move concept score in opposite directions
    pos = initialized_container.steering_service.steer_embedding(
        orig, ConceptEnum.positive_sentiment, 0.75
    )
    neg = initialized_container.steering_service.steer_embedding(
        orig, ConceptEnum.positive_sentiment, -0.75
    )
    assert np.array_equal(orig, orig_snapshot)
    assert pos.shape == (384,) and neg.shape == (384,)
    assert np.isclose(np.linalg.norm(pos), 1.0, atol=1e-5)
    assert np.isclose(np.linalg.norm(neg), 1.0, atol=1e-5)

    base_score = initialized_container.steering_service.compute_concept_score(
        orig, ConceptEnum.positive_sentiment
    )
    pos_score = initialized_container.steering_service.compute_concept_score(
        pos, ConceptEnum.positive_sentiment
    )
    neg_score = initialized_container.steering_service.compute_concept_score(
        neg, ConceptEnum.positive_sentiment
    )
    assert pos_score > base_score > neg_score


def test_similarity_search_ranking_and_exclusion(
    initialized_container: ServiceContainer,
) -> None:
    """Verify cosine nearest neighbors are sorted descending and exclude exact query text."""
    target_record = initialized_container.dataset_service.records[0]
    emb = initialized_container.embedding_service.encode_text(target_record.text)
    corpus_embs = initialized_container.semantic_map_service.corpus_embeddings
    corpus_coords = initialized_container.semantic_map_service.corpus_coords_3d
    assert corpus_embs is not None and corpus_coords is not None

    neighbors = initialized_container.similarity_service.find_nearest_neighbors(
        query_embedding=emb,
        records=initialized_container.dataset_service.records,
        corpus_embeddings=corpus_embs,
        corpus_coords_3d=corpus_coords,
        top_k=5,
        exclude_text=target_record.text,
    )
    assert len(neighbors) == 5
    assert all(item.id != target_record.id for item in neighbors)
    sims = [item.cosine_similarity for item in neighbors]
    assert sims == sorted(sims, reverse=True)


def test_umap_projection_consistency_and_artifact_cache(
    test_settings, initialized_container: ServiceContainer
) -> None:
    """Verify UMAP transform determinism and disk artifact reload consistency."""
    emb = initialized_container.embedding_service.encode_text(
        "Interactive visualizations clarify high-dimensional embeddings."
    )
    coord_first = initialized_container.semantic_map_service.transform_vector(emb)
    coord_second = initialized_container.semantic_map_service.transform_vector(emb)
    assert coord_first == coord_second

    trust = initialized_container.semantic_map_service.trustworthiness
    assert trust is not None
    assert 0.0 <= trust <= 1.0

    # Reload cached artifacts into a fresh SemanticMapService instance
    reloaded = SemanticMapService(
        artifacts_dir=test_settings.artifacts_dir,
        n_components=test_settings.umap_dimensions,
        n_neighbors=test_settings.umap_n_neighbors,
        min_dist=test_settings.umap_min_dist,
        metric=test_settings.umap_metric,
        random_state=test_settings.umap_random_state,
    )
    assert reloaded.try_load_cached_artifacts(
        dataset_hash=initialized_container.dataset_service.dataset_hash,
        model_name=test_settings.model_name,
        corpus_size=initialized_container.dataset_service.size,
    )
    coord_reloaded = reloaded.transform_vector(emb)
    assert coord_reloaded == coord_first


def test_evaluation_service_metrics(
    initialized_container: ServiceContainer,
) -> None:
    """Verify multi-strength evaluation returns monotonic scores and bounded metrics."""
    result = initialized_container.evaluation_service.evaluate(
        text="The engineering team shipped a new release.",
        concept=ConceptEnum.technical_tone,
        strengths=[-1.0, -0.5, 0.0, 0.5, 1.0],
        top_k_neighbors=5,
    )
    assert len(result.steps) == 5
    zero_step = next(s for s in result.steps if s.strength == 0.0)
    assert zero_step.semantic_preservation == 1.0
    assert zero_step.neighbor_stability == 1.0
    assert zero_step.concept_score == result.base_concept_score

    assert result.metrics_summary.monotonicity.is_monotonic is True
    assert result.metrics_summary.monotonicity.spearman_correlation == 1.0
    assert result.metrics_summary.linearity_score is not None
    assert 0.0 <= result.metrics_summary.linearity_score <= 1.0

