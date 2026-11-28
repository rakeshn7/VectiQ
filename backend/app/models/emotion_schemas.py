"""Pydantic v2 schemas for Sentiment + Multi-Emotion Analysis and Human Correction."""

from enum import Enum
import math
from typing import Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.schemas import ConceptEnum, Coordinate3D

PERCENTAGE_TOTAL_TOLERANCE = 1e-3


class SentimentLabel(str, Enum):
    """Discrete polarity classes from twitter-roberta-base-sentiment-latest."""

    positive = "positive"
    neutral = "neutral"
    negative = "negative"


class HumanSentimentLabel(str, Enum):
    """Human-verified sentiment options including Mixed and Uncertain."""

    positive = "positive"
    neutral = "neutral"
    negative = "negative"
    mixed = "mixed"
    uncertain = "uncertain"


class EmotionCategory(str, Enum):
    """Canonical emotion categories backed natively by GoEmotions + honest uncertainty gating."""

    joy = "joy"
    sadness = "sadness"
    anger = "anger"
    fear = "fear"
    surprise = "surprise"
    disgust = "disgust"
    love = "love"
    neutral = "neutral"
    other = "other"
    uncertain = "uncertain"


class ReviewStatus(str, Enum):
    """Lifecycle status of human verification without mutating original predictions."""

    unreviewed = "unreviewed"
    confirmed = "confirmed"
    corrected = "corrected"
    flagged_uncertain = "flagged_uncertain"


class ReviewAction(str, Enum):
    """Permitted human verification actions on an emotion prediction."""

    confirm = "confirm"
    correct = "correct"
    flag_uncertain = "flag_uncertain"


class SentimentProbabilities(BaseModel):
    """Normalized 3-class sentiment polarity probabilities."""

    positive: float = Field(..., ge=0.0, le=1.0)
    neutral: float = Field(..., ge=0.0, le=1.0)
    negative: float = Field(..., ge=0.0, le=1.0)


class SentimentPrediction(BaseModel):
    """Genuine transformer sentiment inference output."""

    predicted_label: SentimentLabel
    effective_label: str
    probabilities: SentimentProbabilities
    confidence: float = Field(..., ge=0.0, le=1.0)
    margin: float = Field(..., ge=0.0, le=1.0)
    is_uncertain: bool
    uncertainty_reason: Optional[str] = None
    model_name: str


class EmotionProbabilityItem(BaseModel):
    """Single emotion class score from the classifier."""

    label: str
    category: EmotionCategory
    probability: float = Field(..., ge=0.0, le=1.0)


class EmotionPrediction(BaseModel):
    """Genuine GoEmotions inference output kept cleanly distinct from sentiment polarity."""

    predicted_emotion: EmotionCategory
    raw_top_label: str
    raw_top_category: EmotionCategory
    confidence: float = Field(..., ge=0.0, le=1.0)
    margin: float = Field(..., ge=0.0, le=1.0)
    is_uncertain: bool
    uncertainty_reason: Optional[str] = None
    probabilities: list[EmotionProbabilityItem]
    taxonomy_note: str
    model_name: str


class CorpusAffectSummary(BaseModel):
    """Precomputed sentiment and emotion summary cached for each corpus sentence."""

    sentiment_label: SentimentLabel
    sentiment_confidence: float
    sentiment_is_uncertain: bool
    emotion_label: EmotionCategory
    emotion_raw_label: str
    emotion_confidence: float
    emotion_is_uncertain: bool


class HumanEmotionDistributionItem(BaseModel):
    """Structured human-confirmed emotion proportion entry (percentage in [0, 100])."""

    emotion: EmotionCategory
    percentage: float

    @field_validator("percentage")
    @classmethod
    def validate_percentage_bounds(cls, value: float) -> float:
        if not math.isfinite(value):
            raise ValueError("Emotion percentage must be a finite number.")
        if value < 0.0:
            raise ValueError("Emotion percentage cannot be negative.")
        if value > 100.0:
            raise ValueError("Emotion percentage cannot exceed 100%.")
        return float(value)


def sort_distribution_desc(
    items: list[HumanEmotionDistributionItem],
) -> list[HumanEmotionDistributionItem]:
    """Return distribution sorted descending by percentage while preserving input tie order."""
    return [
        HumanEmotionDistributionItem(emotion=item.emotion, percentage=item.percentage)
        for item in sorted(items, key=lambda d: -d.percentage)
    ]


def validate_confirmed_distribution(
    items: list[HumanEmotionDistributionItem],
) -> list[HumanEmotionDistributionItem]:
    """Validate confirmed percentage distribution strictly without silent normalization."""
    if not items:
        raise ValueError("Confirmed emotion distribution cannot be empty.")

    seen: set[EmotionCategory] = set()
    total = 0.0
    for item in items:
        if item.emotion == EmotionCategory.uncertain:
            raise ValueError(
                "Category 'uncertain' cannot appear inside a confirmed distribution; "
                "use action='flag_uncertain' instead."
            )
        if item.emotion in seen:
            raise ValueError(
                f"Duplicate emotion '{item.emotion.value}' is not allowed in a human distribution."
            )
        seen.add(item.emotion)
        total += float(item.percentage)

    if abs(total - 100.0) > PERCENTAGE_TOTAL_TOLERANCE:
        raise ValueError(
            f"Human-confirmed emotion percentages must total 100% (got {total:.4g}%)."
        )

    return sort_distribution_desc(items)


def pick_dominant_emotion(
    items: list[HumanEmotionDistributionItem],
    preferred: Optional[EmotionCategory] = None,
) -> EmotionCategory:
    """Return dominant category from validated distribution (honoring tied preferred label)."""
    if not items:
        raise ValueError("Cannot select dominant emotion from an empty distribution.")
    max_pct = max(d.percentage for d in items)
    tied = [d.emotion for d in items if abs(d.percentage - max_pct) <= 1e-9]
    if preferred is not None and preferred in tied:
        return preferred
    return tied[0]


class EnrichedNeighborItem(BaseModel):
    """Nearest corpus neighbor enriched with genuine 384D similarity and emotion/sentiment."""

    id: str
    text: str
    category: str
    cosine_similarity: float
    euclidean_distance: float
    coordinates: Coordinate3D
    sentiment_label: Optional[SentimentLabel] = None
    emotion_label: Optional[EmotionCategory] = None
    emotion_raw_label: Optional[str] = None
    emotion_confidence: Optional[float] = None
    human_emotion_label: Optional[EmotionCategory] = None
    human_emotion_distribution: list[HumanEmotionDistributionItem] = Field(default_factory=list)
    human_sentiment_label: Optional[HumanSentimentLabel] = None


class HumanEmotionOverlay(BaseModel):
    """Separated human-verified emotion & sentiment metadata (never overwrites original model outputs)."""

    review_status: ReviewStatus = ReviewStatus.unreviewed
    human_emotion_label: Optional[EmotionCategory] = None
    human_emotion_distribution: list[HumanEmotionDistributionItem] = Field(default_factory=list)
    human_sentiment_label: Optional[HumanSentimentLabel] = None
    confirmed_for_evaluation: bool = False
    rationale: Optional[str] = None
    reviewed_at: Optional[str] = None
    revision: int = 0
    history_count: int = 0


class EmotionAnalyzeRequest(BaseModel):
    """Request payload for POST /api/v1/emotions/analyze."""

    text: str = Field(..., min_length=1, max_length=1000)
    concept: ConceptEnum = ConceptEnum.positive_sentiment
    top_k_neighbors: int = Field(5, ge=1, le=20)
    include_embeddings: bool = True

    @field_validator("text")
    @classmethod
    def strip_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Input text must contain non-whitespace characters.")
        return cleaned


class EmbeddingInfo(BaseModel):
    """384D embedding metadata and projected frozen UMAP coordinates."""

    model_name: str
    dimensions: int = 384
    normalized: bool = True
    umap_coordinates: Coordinate3D
    concept: ConceptEnum
    concept_score: float
    embedding: Optional[list[float]] = None


class EmotionAnalyzeResponse(BaseModel):
    """Full response returned when projecting and analyzing a sentence."""

    record_id: str
    input_text: str
    sentiment: SentimentPrediction
    emotion: EmotionPrediction
    embedding_info: EmbeddingInfo
    nearest_neighbors: list[EnrichedNeighborItem]
    review: HumanEmotionOverlay
    created_at: str


class EmotionReviewRequest(BaseModel):
    """Request payload for POST /api/v1/emotions/reviews supporting emotion distributions and sentiment."""

    record_id: str = Field(..., min_length=1, max_length=128)
    action: ReviewAction
    human_emotion_label: Optional[EmotionCategory] = None
    human_emotion_distribution: Optional[list[HumanEmotionDistributionItem]] = None
    human_sentiment_label: Optional[HumanSentimentLabel] = None
    rationale: Optional[str] = Field(default=None, max_length=500)

    @field_validator("rationale")
    @classmethod
    def clean_rationale(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @model_validator(mode="after")
    def validate_action_and_distribution(self) -> "EmotionReviewRequest":
        if self.action == ReviewAction.flag_uncertain:
            if (
                self.human_emotion_label is not None
                and self.human_emotion_label != EmotionCategory.uncertain
            ):
                raise ValueError("action='flag_uncertain' requires human_emotion_label='uncertain'.")
            if self.human_emotion_distribution:
                raise ValueError(
                    "Uncertain annotations do not carry confirmed emotion percentages."
                )
            self.human_emotion_label = EmotionCategory.uncertain
            self.human_emotion_distribution = []
            if self.human_sentiment_label is None:
                self.human_sentiment_label = HumanSentimentLabel.uncertain
            return self

        if self.human_emotion_distribution is not None:
            validated = validate_confirmed_distribution(self.human_emotion_distribution)
            dominant = pick_dominant_emotion(validated, preferred=self.human_emotion_label)
            if self.human_emotion_label is not None:
                if self.human_emotion_label == EmotionCategory.uncertain:
                    raise ValueError(
                        "Use action='flag_uncertain' to flag a record as uncertain."
                    )
                max_pct = max(d.percentage for d in validated)
                tied_emotions = {
                    d.emotion for d in validated if abs(d.percentage - max_pct) <= 1e-9
                }
                if self.human_emotion_label not in tied_emotions:
                    raise ValueError(
                        f"human_emotion_label '{self.human_emotion_label.value}' must match "
                        f"the dominant emotion '{dominant.value}' in human_emotion_distribution."
                    )
            self.human_emotion_distribution = validated
            self.human_emotion_label = dominant
            return self

        # Backward-compatible single-emotion payload (interpreted as 100%)
        if self.human_emotion_label is None:
            raise ValueError(
                "Provide either human_emotion_distribution totaling 100% or a human_emotion_label."
            )
        if self.human_emotion_label == EmotionCategory.uncertain:
            self.human_emotion_distribution = []
            if self.human_sentiment_label is None:
                self.human_sentiment_label = HumanSentimentLabel.uncertain
        else:
            self.human_emotion_distribution = [
                HumanEmotionDistributionItem(emotion=self.human_emotion_label, percentage=100.0)
            ]
        return self


class EmotionReviewHistoryItem(BaseModel):
    """Timestamped audit entry tracking human confirmation or percentage correction."""

    history_id: str
    record_id: str
    revision: int = 1
    previous_status: ReviewStatus
    new_status: ReviewStatus
    previous_human_emotion: Optional[EmotionCategory] = None
    new_human_emotion: EmotionCategory
    previous_human_distribution: list[HumanEmotionDistributionItem] = Field(default_factory=list)
    new_human_distribution: list[HumanEmotionDistributionItem] = Field(default_factory=list)
    previous_human_sentiment: Optional[HumanSentimentLabel] = None
    new_human_sentiment: Optional[HumanSentimentLabel] = None
    action: ReviewAction
    rationale: Optional[str] = None
    reviewed_at: str


class EmotionReviewResponse(BaseModel):
    """Response payload for POST/GET human emotion verification endpoints."""

    record_id: str
    input_text: str
    original_sentiment: SentimentPrediction
    original_emotion: EmotionPrediction
    umap_coordinates: Coordinate3D
    review: HumanEmotionOverlay
    history: list[EmotionReviewHistoryItem] = Field(default_factory=list)


class HumanEmotionEvaluationRecord(BaseModel):
    """Single confirmed/corrected record used in multi-label evaluation (excluding uncertain/unreviewed)."""

    record_id: str
    input_text: str
    review_status: ReviewStatus
    model_predicted_emotion: EmotionCategory
    model_confidence: float
    model_predicted_sentiment: Optional[SentimentLabel] = None
    dominant_human_emotion: EmotionCategory
    human_emotion_distribution: list[HumanEmotionDistributionItem]
    human_sentiment_label: Optional[HumanSentimentLabel] = None
    is_mixed_human_distribution: bool
    dominant_agreement: bool
    model_top1_in_human_multilabel: bool
    soft_overlap_score: float = Field(..., ge=0.0, le=1.0)
    reviewed_at: Optional[str] = None
    revision: int = 1


class HumanEmotionEvaluationSummary(BaseModel):
    """Evaluation integrity summary using complete human distributions and excluding uncertain/unreviewed records."""

    total_records: int
    confirmed_ground_truth_count: int
    confirmed_count: int
    corrected_count: int
    excluded_uncertain_count: int
    excluded_unreviewed_count: int
    mixed_distribution_count: int
    single_emotion_count: int
    dominant_top1_agreement: Optional[float] = None
    multilabel_target_coverage: Optional[float] = None
    mean_soft_distribution_overlap: Optional[float] = None
    methodology: str
    limitations: str
    records: list[HumanEmotionEvaluationRecord] = Field(default_factory=list)
