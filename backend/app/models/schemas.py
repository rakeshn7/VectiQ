"""Pydantic v2 request and response schemas aligned with contracts/api-contract.md."""

from enum import Enum
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator


class ConceptEnum(str, Enum):
    """Supported semantic steering concepts."""

    positive_sentiment = "positive_sentiment"
    technical_tone = "technical_tone"
    formal_tone = "formal_tone"


class RootResponse(BaseModel):
    """Response model for the API root endpoint."""

    message: str = Field(..., description="Welcome message for the API.")
    service: str = Field(..., description="Application service name.")
    version: str = Field(..., description="API version.")
    docs_url: str = Field(default="/docs", description="OpenAPI documentation path.")


class ErrorDetailItem(BaseModel):
    """Detailed validation or domain error item."""

    field: Optional[str] = None
    issue: str
    value: Any = None


class ErrorBody(BaseModel):
    """Standardized API error payload body."""

    code: str
    message: str
    status: int
    timestamp: str
    details: Optional[list[ErrorDetailItem]] = None


class ErrorResponse(BaseModel):
    """Top-level standard HTTP error envelope."""

    error: ErrorBody


class Coordinate3D(BaseModel):
    """Projected coordinates in 3-dimensional visualization space."""

    x: float
    y: float
    z: float


class NearestNeighborItem(BaseModel):
    """Reference corpus item identified as a nearest neighbor in 384D space."""

    id: str
    text: str
    category: str
    cosine_similarity: float
    euclidean_distance: float
    coordinates: Coordinate3D


class HealthResponse(BaseModel):
    """Response model for GET /api/v1/health."""

    status: Literal["healthy", "degraded"]
    version: str
    model_loaded: bool
    umap_fitted: bool
    corpus_size: int = Field(..., ge=0)
    timestamp: str


class ModelConfigMetadata(BaseModel):
    """Model metadata block in GET /api/v1/config."""

    name: str
    dimensions: int
    max_sequence_length: int
    normalized_embeddings: bool


class ConceptMetadata(BaseModel):
    """Metadata describing a steering concept for UI selectors."""

    id: ConceptEnum
    label: str
    description: str
    negative_label: str
    positive_label: str


class SteeringConfigMetadata(BaseModel):
    """Steering controls configuration in GET /api/v1/config."""

    min_strength: float
    max_strength: float
    default_strength: float
    step: float
    concepts: list[ConceptMetadata]


class ProjectionConfigMetadata(BaseModel):
    """UMAP projection configuration in GET /api/v1/config."""

    method: Literal["UMAP"] = "UMAP"
    dimensions: int
    n_neighbors: int
    min_dist: float
    metric: str


class ConfigResponse(BaseModel):
    """Response model for GET /api/v1/config."""

    model: ModelConfigMetadata
    steering: SteeringConfigMetadata
    projection: ProjectionConfigMetadata


class MapBounds(BaseModel):
    """3D bounding box for semantic map points."""

    x_min: float
    x_max: float
    y_min: float
    y_max: float
    z_min: float
    z_max: float


class ClusterSummary(BaseModel):
    """Cluster metadata summary for semantic map categories."""

    id: str
    label: str
    color: str
    point_count: int


class SemanticMapPoint(BaseModel):
    """Single reference corpus point in the semantic map."""

    id: str
    text: str
    category: str
    coordinates: Coordinate3D
    concept_scores: dict[ConceptEnum, float]
    embedding: Optional[list[float]] = None


class SemanticMapResponse(BaseModel):
    """Response model for GET /api/v1/semantic-map."""

    total_points: int
    bounds: MapBounds
    clusters: list[ClusterSummary]
    points: list[SemanticMapPoint]
    umap_trustworthiness: Optional[float] = Field(
        default=None,
        description="Local neighborhood preservation score (sklearn trustworthiness) in [0, 1].",
    )


class SteerRequest(BaseModel):
    """Request payload for POST /api/v1/steer."""

    text: str = Field(..., min_length=1, max_length=1000, description="Input text to steer")
    concept: ConceptEnum
    strength: float = Field(
        ..., ge=-1.0, le=1.0, description="Steering factor between -1.0 and +1.0"
    )
    top_k_neighbors: int = Field(5, ge=1, le=20)
    include_embeddings: bool = Field(
        True, description="Whether to include 384d raw float embeddings"
    )

    @field_validator("text")
    @classmethod
    def validate_non_empty_text(cls, value: str) -> str:
        """Ensure input text is not empty or whitespace-only."""
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Input text must contain non-whitespace characters.")
        return cleaned

    @field_validator("strength")
    @classmethod
    def validate_finite_strength(cls, value: float) -> float:
        """Ensure strength is a finite floating-point number."""
        import math

        if not math.isfinite(value):
            raise ValueError("Steering strength must be a finite number.")
        return value


class VectorStateSnapshot(BaseModel):
    """Original or steered vector snapshot in 3D and 384D spaces."""

    coordinates: Coordinate3D
    concept_score: float
    nearest_neighbors: list[NearestNeighborItem]
    embedding: Optional[list[float]] = None


class CoordinateShift(BaseModel):
    """Displacement in 3D UMAP projection space."""

    dx: float
    dy: float
    dz: float
    projection_displacement: float


class MovementMetrics(BaseModel):
    """Movement metrics between original and steered vectors."""

    euclidean_distance_384d: float
    cosine_distance_384d: float
    angle_radians: float
    angle_degrees: float
    coordinate_shift: CoordinateShift
    trajectory_vector_384d: Optional[list[float]] = None


class PreservationMetrics(BaseModel):
    """Semantic preservation metrics between original and steered vectors."""

    semantic_preservation_score: float
    magnitude_drift: float
    cosine_similarity: float


class ConceptMetrics(BaseModel):
    """Alignment metrics along the target steering concept."""

    original_score: float
    steered_score: float
    delta: float
    target_alignment: float


class SteerResponse(BaseModel):
    """Response model for POST /api/v1/steer."""

    input_text: str
    concept: ConceptEnum
    strength: float
    original: VectorStateSnapshot
    steered: VectorStateSnapshot
    movement: MovementMetrics
    preservation: PreservationMetrics
    concept_metrics: ConceptMetrics


DEFAULT_EVAL_STRENGTHS = [-1.0, -0.75, -0.5, -0.25, 0.0, 0.25, 0.5, 0.75, 1.0]


class EvaluateRequest(BaseModel):
    """Request payload for POST /api/v1/evaluate."""

    text: str = Field(..., min_length=1, max_length=1000)
    concept: ConceptEnum
    strengths: Optional[list[float]] = Field(
        default_factory=lambda: list(DEFAULT_EVAL_STRENGTHS),
        min_length=3,
        max_length=21,
    )
    top_k_neighbors: int = Field(5, ge=1, le=20)

    @field_validator("text")
    @classmethod
    def validate_non_empty_text(cls, value: str) -> str:
        """Ensure input text is not empty or whitespace-only."""
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Input text must contain non-whitespace characters.")
        return cleaned

    @field_validator("strengths")
    @classmethod
    def validate_strengths_range(cls, value: Optional[list[float]]) -> list[float]:
        """Validate all strength values are finite and within [-1.0, 1.0]."""
        import math

        if value is None:
            return list(DEFAULT_EVAL_STRENGTHS)
        for item in value:
            if not math.isfinite(item) or item < -1.0 or item > 1.0:
                raise ValueError(
                    f"Each strength value must be finite and between -1.0 and 1.0; got {item}."
                )
        return value


class EvaluationStep(BaseModel):
    """Single strength evaluation point."""

    strength: float
    concept_score: float
    semantic_preservation: float
    neighbor_stability: float
    coordinates: Coordinate3D
    nearest_neighbors: list[NearestNeighborItem]


class MonotonicitySummary(BaseModel):
    """Monotonicity summary across evaluated steering strengths."""

    is_monotonic: bool
    spearman_correlation: Optional[float]
    pearson_correlation: Optional[float]
    directional_consistency: Optional[float]


class PreservationSummary(BaseModel):
    """Semantic preservation summary across evaluated strengths."""

    mean_preservation: float
    min_preservation: float
    preservation_decay_rate: float


class StabilitySummary(BaseModel):
    """Nearest-neighbor stability summary across evaluated strengths."""

    mean_neighbor_stability: float
    min_neighbor_stability: float
    retained_original_neighbors_at_max: int


class EvaluationMetricsSummary(BaseModel):
    """Aggregate evaluation metrics block."""

    monotonicity: MonotonicitySummary
    preservation_retention: PreservationSummary
    stability_summary: StabilitySummary
    linearity_score: Optional[float]
    umap_trustworthiness: Optional[float] = None


class EvaluateResponse(BaseModel):
    """Response model for POST /api/v1/evaluate."""

    input_text: str
    concept: ConceptEnum
    base_concept_score: float
    steps: list[EvaluationStep]
    metrics_summary: EvaluationMetricsSummary
