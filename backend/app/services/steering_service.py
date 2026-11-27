"""Contrastive vector steering and movement metrics service."""

import math

import numpy as np

from app.core.exceptions import EngineNotReadyError, InvalidInputError
from app.core.logging import get_logger
from app.models.schemas import (
    ConceptEnum,
    ConceptMetadata,
    ConceptMetrics,
    Coordinate3D,
    CoordinateShift,
    MovementMetrics,
    PreservationMetrics,
)
from app.services.dataset_service import DatasetService
from app.services.embedding_service import (
    NORM_EPSILON,
    safe_cosine_similarity,
    safe_l2_normalize,
)

logger = get_logger(__name__)

CONCEPT_CATALOG: list[ConceptMetadata] = [
    ConceptMetadata(
        id=ConceptEnum.positive_sentiment,
        label="Positive Sentiment",
        description="Steers emotional valence towards optimism and constructive feedback.",
        negative_label="Negative Sentiment",
        positive_label="Positive Sentiment",
    ),
    ConceptMetadata(
        id=ConceptEnum.technical_tone,
        label="Technical Tone",
        description="Steers phrasing towards analytical, specialized engineering terminology.",
        negative_label="Colloquial / Simple",
        positive_label="Technical / Analytical",
    ),
    ConceptMetadata(
        id=ConceptEnum.formal_tone,
        label="Formal Tone",
        description="Steers tone towards executive, professional, and academic register.",
        negative_label="Casual / Informal",
        positive_label="Formal / Professional",
    ),
]


class SteeringService:
    """Computes contrastive concept directions and applies normalized vector steering."""

    def __init__(self, expected_dimension: int = 384) -> None:
        self.expected_dimension = expected_dimension
        self.directions: dict[ConceptEnum, np.ndarray] = {}

    @property
    def is_ready(self) -> bool:
        """Return True when all supported concept directions are computed."""
        return all(concept in self.directions for concept in ConceptEnum)

    def fit_directions(
        self,
        dataset_service: DatasetService,
        corpus_embeddings: np.ndarray,
    ) -> dict[ConceptEnum, np.ndarray]:
        """Compute D = normalize(mean(P) - mean(N)) for every concept."""
        directions: dict[ConceptEnum, np.ndarray] = {}

        for concept in ConceptEnum:
            pos_idx, neg_idx = dataset_service.get_concept_anchor_indices(concept)
            pos_mean = np.mean(corpus_embeddings[pos_idx], axis=0, dtype=np.float64)
            neg_mean = np.mean(corpus_embeddings[neg_idx], axis=0, dtype=np.float64)
            diff = (pos_mean - neg_mean).astype(np.float32)

            diff_norm = float(np.linalg.norm(diff))
            if diff_norm <= NORM_EPSILON:
                raise ValueError(
                    f"Degenerate zero-norm direction vector computed for '{concept.value}'."
                )

            direction = safe_l2_normalize(diff)
            directions[concept] = direction
            logger.info(
                "Computed steering direction for '%s' (%d positive, %d negative anchors).",
                concept.value,
                len(pos_idx),
                len(neg_idx),
            )

        self.directions = directions
        return self.directions

    def get_direction(self, concept: ConceptEnum) -> np.ndarray:
        """Return a read-only copy of the unit steering direction for a concept."""
        if concept not in self.directions:
            raise EngineNotReadyError(
                f"Steering direction for '{concept.value}' is not initialized."
            )
        return self.directions[concept]

    def steer_embedding(
        self,
        original_embedding: np.ndarray,
        concept: ConceptEnum,
        strength: float,
    ) -> np.ndarray:
        """Apply E' = normalize(E + alpha * D) while preserving E unmodified."""
        if not math.isfinite(strength) or strength < -1.0 or strength > 1.0:
            raise InvalidInputError(
                f"Steering strength must be between -1.0 and 1.0; got {strength}.",
                details=[{"field": "strength", "issue": "out of range [-1.0, 1.0]", "value": strength}],
            )

        base = safe_l2_normalize(original_embedding)
        if base.shape != (self.expected_dimension,):
            raise ValueError(
                f"Expected {self.expected_dimension}D vector, got {base.shape}."
            )

        if strength == 0.0:
            return np.array(base, dtype=np.float32, copy=True)

        direction = self.get_direction(concept)
        combined = (base + np.float32(strength) * direction).astype(np.float32)
        steered = safe_l2_normalize(combined)

        if float(np.linalg.norm(steered)) <= NORM_EPSILON:
            return np.array(base, dtype=np.float32, copy=True)

        return steered

    def compute_concept_score(
        self, embedding: np.ndarray, concept: ConceptEnum
    ) -> float:
        """Compute cosine alignment between an embedding and a concept direction."""
        direction = self.get_direction(concept)
        return safe_cosine_similarity(embedding, direction)

    def compute_all_concept_scores(
        self, embedding: np.ndarray
    ) -> dict[ConceptEnum, float]:
        """Compute alignment scores across all configured steering concepts."""
        return {
            concept: self.compute_concept_score(embedding, concept)
            for concept in ConceptEnum
        }

    def compute_corpus_concept_scores(
        self, corpus_embeddings: np.ndarray
    ) -> dict[ConceptEnum, np.ndarray]:
        """Vectorized concept score computation for the full corpus matrix."""
        scores: dict[ConceptEnum, np.ndarray] = {}
        norm_corpus = safe_l2_normalize(corpus_embeddings)
        for concept in ConceptEnum:
            direction = self.get_direction(concept)
            scores[concept] = np.clip(norm_corpus @ direction, -1.0, 1.0)
        return scores

    def compute_comparison_metrics(
        self,
        *,
        original_embedding: np.ndarray,
        steered_embedding: np.ndarray,
        original_coords: Coordinate3D,
        steered_coords: Coordinate3D,
        concept: ConceptEnum,
        include_trajectory: bool = True,
    ) -> tuple[MovementMetrics, PreservationMetrics, ConceptMetrics]:
        """Compute 384D movement, preservation, and concept metrics."""
        orig = np.asarray(original_embedding, dtype=np.float32)
        steered = np.asarray(steered_embedding, dtype=np.float32)

        cos_sim = safe_cosine_similarity(orig, steered)
        cos_dist = max(0.0, 1.0 - cos_sim)
        euclid_384d = float(np.linalg.norm(steered - orig))
        angle_rad = float(math.acos(max(-1.0, min(1.0, cos_sim))))
        angle_deg = float(math.degrees(angle_rad))

        dx = float(steered_coords.x - original_coords.x)
        dy = float(steered_coords.y - original_coords.y)
        dz = float(steered_coords.z - original_coords.z)
        proj_disp = float(math.sqrt(dx * dx + dy * dy + dz * dz))

        orig_norm = float(np.linalg.norm(orig))
        steered_norm = float(np.linalg.norm(steered))
        magnitude_drift = (
            abs(steered_norm - orig_norm) / orig_norm
            if orig_norm > NORM_EPSILON
            else 0.0
        )

        orig_score = self.compute_concept_score(orig, concept)
        steered_score = self.compute_concept_score(steered, concept)
        delta = steered_score - orig_score

        trajectory = (
            (steered - orig).astype(np.float32).tolist()
            if include_trajectory
            else None
        )

        movement = MovementMetrics(
            euclidean_distance_384d=round(euclid_384d, 6),
            cosine_distance_384d=round(cos_dist, 6),
            angle_radians=round(angle_rad, 6),
            angle_degrees=round(angle_deg, 6),
            coordinate_shift=CoordinateShift(
                dx=round(dx, 6),
                dy=round(dy, 6),
                dz=round(dz, 6),
                projection_displacement=round(proj_disp, 6),
            ),
            trajectory_vector_384d=trajectory,
        )

        preservation = PreservationMetrics(
            semantic_preservation_score=round(cos_sim, 6),
            magnitude_drift=round(magnitude_drift, 6),
            cosine_similarity=round(cos_sim, 6),
        )

        concept_metrics = ConceptMetrics(
            original_score=round(orig_score, 6),
            steered_score=round(steered_score, 6),
            delta=round(delta, 6),
            target_alignment=round(steered_score, 6),
        )

        return movement, preservation, concept_metrics

