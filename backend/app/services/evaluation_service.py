"""Quantitative evaluation service for steering control, preservation, stability, and monotonicity."""

import math
from typing import Optional

import numpy as np
from scipy.stats import pearsonr, spearmanr

from app.core.exceptions import EngineNotReadyError
from app.models.schemas import (
    ConceptEnum,
    EvaluateResponse,
    EvaluationMetricsSummary,
    EvaluationStep,
    MonotonicitySummary,
    PreservationSummary,
    StabilitySummary,
)
from app.services.dataset_service import DatasetService
from app.services.embedding_service import EmbeddingService, safe_cosine_similarity
from app.services.semantic_map_service import SemanticMapService
from app.services.similarity_service import SimilarityService
from app.services.steering_service import SteeringService

MONOTONIC_EPSILON = 1e-6


def _jaccard_similarity(ids_a: set[str], ids_b: set[str]) -> float:
    """Compute Jaccard overlap between two neighbor ID sets."""
    if not ids_a and not ids_b:
        return 1.0
    union = ids_a | ids_b
    if not union:
        return 0.0
    return float(len(ids_a & ids_b) / len(union))


class EvaluationService:
    """Evaluates multi-strength steering behavior with actual embeddings and metrics."""

    def __init__(
        self,
        *,
        dataset_service: DatasetService,
        embedding_service: EmbeddingService,
        steering_service: SteeringService,
        semantic_map_service: SemanticMapService,
        similarity_service: SimilarityService,
    ) -> None:
        self.dataset_service = dataset_service
        self.embedding_service = embedding_service
        self.steering_service = steering_service
        self.semantic_map_service = semantic_map_service
        self.similarity_service = similarity_service

    def evaluate(
        self,
        *,
        text: str,
        concept: ConceptEnum,
        strengths: list[float],
        top_k_neighbors: int = 5,
    ) -> EvaluateResponse:
        """Sweep steering strengths and compute step and aggregate evaluation metrics."""
        if (
            not self.semantic_map_service.is_fitted
            or self.semantic_map_service.corpus_embeddings is None
            or self.semantic_map_service.corpus_coords_3d is None
        ):
            raise EngineNotReadyError("Semantic map projection is not initialized.")

        orig_emb = self.embedding_service.encode_text(text)
        base_score = self.steering_service.compute_concept_score(orig_emb, concept)

        base_neighbors = self.similarity_service.find_nearest_neighbors(
            query_embedding=orig_emb,
            records=self.dataset_service.records,
            corpus_embeddings=self.semantic_map_service.corpus_embeddings,
            corpus_coords_3d=self.semantic_map_service.corpus_coords_3d,
            top_k=top_k_neighbors,
            exclude_text=text,
        )
        base_neighbor_ids = {item.id for item in base_neighbors}

        step_embeddings = np.stack(
            [
                self.steering_service.steer_embedding(orig_emb, concept, strength)
                for strength in strengths
            ],
            axis=0,
        )
        step_coords = self.semantic_map_service.transform_batch(step_embeddings)

        steps: list[EvaluationStep] = []
        step_neighbor_sets: list[set[str]] = []

        for idx, strength in enumerate(strengths):
            emb_step = step_embeddings[idx]
            concept_score = self.steering_service.compute_concept_score(emb_step, concept)
            preservation = (
                1.0
                if strength == 0.0
                else safe_cosine_similarity(orig_emb, emb_step)
            )
            neighbors = (
                base_neighbors
                if strength == 0.0
                else self.similarity_service.find_nearest_neighbors(
                    query_embedding=emb_step,
                    records=self.dataset_service.records,
                    corpus_embeddings=self.semantic_map_service.corpus_embeddings,
                    corpus_coords_3d=self.semantic_map_service.corpus_coords_3d,
                    top_k=top_k_neighbors,
                    exclude_text=text,
                )
            )
            neighbor_ids = {item.id for item in neighbors}
            stability = _jaccard_similarity(base_neighbor_ids, neighbor_ids)

            step_neighbor_sets.append(neighbor_ids)
            steps.append(
                EvaluationStep(
                    strength=float(strength),
                    concept_score=round(concept_score, 6),
                    semantic_preservation=round(preservation, 6),
                    neighbor_stability=round(stability, 6),
                    coordinates=step_coords[idx],
                    nearest_neighbors=neighbors,
                )
            )

        summary = self._build_summary(
            steps=steps,
            step_neighbor_sets=step_neighbor_sets,
            base_neighbor_ids=base_neighbor_ids,
        )

        return EvaluateResponse(
            input_text=text,
            concept=concept,
            base_concept_score=round(base_score, 6),
            steps=steps,
            metrics_summary=summary,
        )

    def _build_summary(
        self,
        *,
        steps: list[EvaluationStep],
        step_neighbor_sets: list[set[str]],
        base_neighbor_ids: set[str],
    ) -> EvaluationMetricsSummary:
        """Compute monotonicity, preservation retention, stability, and linearity metrics."""
        paired = sorted(
            zip(steps, step_neighbor_sets), key=lambda pair: pair[0].strength
        )
        sorted_strengths = [pair[0].strength for pair in paired]
        sorted_scores = [pair[0].concept_score for pair in paired]

        is_monotonic = all(
            sorted_scores[i + 1] >= sorted_scores[i] - MONOTONIC_EPSILON
            for i in range(len(sorted_scores) - 1)
        )

        spearman_val: Optional[float] = None
        pearson_val: Optional[float] = None
        linearity_val: Optional[float] = None

        if len(set(sorted_strengths)) >= 2 and np.std(sorted_scores) > 0:
            sp = spearmanr(sorted_strengths, sorted_scores).statistic
            if sp is not None and math.isfinite(float(sp)):
                spearman_val = round(float(sp), 6)

            pr = pearsonr(sorted_strengths, sorted_scores).statistic
            if pr is not None and math.isfinite(float(pr)):
                pearson_val = round(float(pr), 6)
                linearity_val = round(float(pr) ** 2, 6)

        interval_checks: list[bool] = []
        for i in range(len(sorted_strengths) - 1):
            d_strength = sorted_strengths[i + 1] - sorted_strengths[i]
            if d_strength > MONOTONIC_EPSILON:
                d_score = sorted_scores[i + 1] - sorted_scores[i]
                interval_checks.append(d_score >= -MONOTONIC_EPSILON)

        directional_consistency: Optional[float] = (
            round(float(sum(interval_checks) / len(interval_checks)), 6)
            if interval_checks
            else None
        )

        preservations = [step.semantic_preservation for step in steps]
        mean_pres = round(float(np.mean(preservations)), 6)
        min_pres = round(float(np.min(preservations)), 6)
        decay_rate = round(max(0.0, 1.0 - min_pres), 6)

        stabilities = [step.neighbor_stability for step in steps]
        mean_stab = round(float(np.mean(stabilities)), 6)
        min_stab = round(float(np.min(stabilities)), 6)

        # Retained count at maximum positive (or largest) strength step
        max_neighbor_set = paired[-1][1]
        retained_at_max = len(base_neighbor_ids & max_neighbor_set)

        return EvaluationMetricsSummary(
            monotonicity=MonotonicitySummary(
                is_monotonic=is_monotonic,
                spearman_correlation=spearman_val,
                pearson_correlation=pearson_val,
                directional_consistency=directional_consistency,
            ),
            preservation_retention=PreservationSummary(
                mean_preservation=mean_pres,
                min_preservation=min_pres,
                preservation_decay_rate=decay_rate,
            ),
            stability_summary=StabilitySummary(
                mean_neighbor_stability=mean_stab,
                min_neighbor_stability=min_stab,
                retained_original_neighbors_at_max=retained_at_max,
            ),
            linearity_score=linearity_val,
            umap_trustworthiness=self.semantic_map_service.trustworthiness,
        )

