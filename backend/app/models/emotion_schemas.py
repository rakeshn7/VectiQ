"""Pydantic v2 schemas for Sentiment + Multi-Emotion Analysis and Human Correction."""

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.schemas import ConceptEnum, Coordinate3D


class SentimentLabel(str, Enum):
    """Discrete polarity classes from twitter-roberta-base-sentiment-latest."""

    positive = "positive"
    neutral = "neutral"
    negative = "negative"


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


class HumanEmotionOverlay(BaseModel):
    """Separated human-verified emotion metadata (never overwrites original model outputs)."""

    review_status: ReviewStatus = ReviewStatus.unreviewed
    human_emotion_label: Optional[EmotionCategory] = None
    rationale: Optional[str] = None
    reviewed_at: Optional[str] = None
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
    """Request payload for POST /api/v1/emotions/reviews."""

    record_id: str = Field(..., min_length=1, max_length=128)
    action: ReviewAction
    human_emotion_label: EmotionCategory
    rationale: Optional[str] = Field(default=None, max_length=500)

    @field_validator("rationale")
    @classmethod
    def clean_rationale(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @model_validator(mode="after")
    def check_action_label_consistency(self) -> "EmotionReviewRequest":
        if self.action == ReviewAction.flag_uncertain and self.human_emotion_label != EmotionCategory.uncertain:
            raise ValueError("action='flag_uncertain' requires human_emotion_label='uncertain'.")
        return self


class EmotionReviewHistoryItem(BaseModel):
    """Timestamped audit entry tracking human confirmation or correction."""

    history_id: str
    record_id: str
    previous_status: ReviewStatus
    new_status: ReviewStatus
    previous_human_emotion: Optional[EmotionCategory] = None
    new_human_emotion: EmotionCategory
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
