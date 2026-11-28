/**
 * Canonical API Types for Semantic Space Studio (VectiQ)
 *
 * Strictly synchronized with repository root: contracts/api-contract.md (v1.0.0).
 * Do not modify field names or response shapes without updating contracts/api-contract.md.
 */

export type ConceptId = 'positive_sentiment' | 'technical_tone' | 'formal_tone';

export interface Coordinate3D {
  x: number;
  y: number;
  z: number;
}

export interface NearestNeighborItem {
  id: string;
  text: string;
  category: string;
  cosine_similarity: number;
  euclidean_distance: number;
  coordinates: Coordinate3D;
}

export interface ConceptMetadata {
  id: ConceptId;
  label: string;
  description: string;
  negative_label: string;
  positive_label: string;
}

/**
 * GET /api/v1/health
 */
export interface HealthResponse {
  status: 'healthy' | 'degraded';
  version: string;
  model_loaded: boolean;
  umap_fitted: boolean;
  corpus_size: number;
  timestamp: string;
}

/**
 * GET /api/v1/config
 */
export interface ConfigResponse {
  model: {
    name: string;
    dimensions: number;
    max_sequence_length: number;
    normalized_embeddings: boolean;
  };
  steering: {
    min_strength: number;
    max_strength: number;
    default_strength: number;
    step: number;
    concepts: ConceptMetadata[];
  };
  projection: {
    method: 'UMAP';
    dimensions: number;
    n_neighbors: number;
    min_dist: number;
    metric: string;
  };
}

/**
 * GET /api/v1/semantic-map
 */
export type GraphEmotionLabelMode = 'human' | 'model';

export interface HumanEmotionDistributionItem {
  emotion: EmotionCategory;
  percentage: number;
}

export interface SemanticMapHumanEmotionItem {
  emotion: string;
  percentage: number;
}

export interface SemanticMapQueryParams {
  include_embeddings?: boolean;
  category?: string;
  sentiment?: string;
  emotion?: string;
  label_mode?: GraphEmotionLabelMode;
  search?: string;
  limit?: number;
}

export interface SemanticMapPoint {
  id: string;
  text: string;
  category: string;
  coordinates: Coordinate3D;
  concept_scores: Record<ConceptId, number>;
  embedding: number[] | null;
  sentiment_label?: SentimentLabel | null;
  sentiment_confidence?: number | null;
  sentiment_is_uncertain?: boolean | null;
  emotion_label?: EmotionCategory | null;
  emotion_raw_label?: string | null;
  emotion_confidence?: number | null;
  emotion_is_uncertain?: boolean | null;
  human_emotion_label?: EmotionCategory | null;
  human_emotion_distribution?: SemanticMapHumanEmotionItem[];
  human_sentiment_label?: HumanSentimentLabel | null;
  confirmed_for_evaluation?: boolean;
  emotion_review_status?: ReviewStatus | null;
}

export interface SemanticMapResponse {
  total_points: number;
  bounds: {
    x_min: number;
    x_max: number;
    y_min: number;
    y_max: number;
    z_min: number;
    z_max: number;
  };
  clusters: Array<{
    id: string;
    label: string;
    color: string;
    point_count: number;
  }>;
  points: SemanticMapPoint[];
}

/**
 * POST /api/v1/steer
 */
export interface SteerRequest {
  text: string;
  concept: ConceptId;
  strength: number;
  top_k_neighbors?: number;
  include_embeddings?: boolean;
}

export interface SteerResponse {
  input_text: string;
  concept: ConceptId;
  strength: number;
  original: {
    coordinates: Coordinate3D;
    concept_score: number;
    nearest_neighbors: NearestNeighborItem[];
    embedding?: number[];
  };
  steered: {
    coordinates: Coordinate3D;
    concept_score: number;
    nearest_neighbors: NearestNeighborItem[];
    embedding?: number[];
  };
  movement: {
    euclidean_distance_384d: number;
    cosine_distance_384d: number;
    angle_radians: number;
    angle_degrees: number;
    coordinate_shift: {
      dx: number;
      dy: number;
      dz: number;
      projection_displacement: number;
    };
    trajectory_vector_384d?: number[];
  };
  preservation: {
    semantic_preservation_score: number;
    magnitude_drift: number;
    cosine_similarity: number;
  };
  concept_metrics: {
    original_score: number;
    steered_score: number;
    delta: number;
    target_alignment: number;
  };
}

/**
 * POST /api/v1/evaluate
 */
export interface EvaluateRequest {
  text: string;
  concept: ConceptId;
  strengths?: number[];
  top_k_neighbors?: number;
  continuity_k?: number;
  overlap_k?: number;
}

export interface EvaluationStep {
  strength: number;
  concept_score: number;
  semantic_preservation: number;
  neighbor_stability: number;
  coordinates: Coordinate3D;
  nearest_neighbors: NearestNeighborItem[];
}

export type MetricStatus = 'computed' | 'passed' | 'partial' | 'failed' | 'unavailable';

export interface MetricEvaluationDetail {
  value?: number | null;
  status: MetricStatus;
  sample_size: number;
  parameters: Record<string, unknown>;
  methodology: string;
  limitations: string;
  unavailable_reason?: string | null;
}

export interface OverlapPointExample {
  id: string;
  overlap_rate: number;
  jaccard: number;
}

export interface NeighborhoodOverlapDetail extends MetricEvaluationDetail {
  mean_jaccard?: number | null;
  min_overlap?: number | null;
  max_overlap?: number | null;
  projected_vs_384d_overlap_2d?: number | null;
  projected_vs_384d_overlap_3d?: number | null;
  point_examples?: OverlapPointExample[];
}

export interface ProjectionDistortionDetail extends MetricEvaluationDetail {
  spearman_correlation?: number | null;
  pearson_correlation?: number | null;
  kruskal_stress_1?: number | null;
  pair_count: number;
}

export interface TransformStabilityDetail extends MetricEvaluationDetail {
  runs: number;
  tolerance: number;
  repeat_batch_max_diff?: number | null;
  repeat_batch_mean_diff?: number | null;
  order_invariance_max_diff?: number | null;
  order_invariance_mean_diff?: number | null;
  single_vs_batch_max_diff?: number | null;
  single_vs_batch_mean_diff?: number | null;
  is_deterministic?: boolean | null;
  is_order_invariant?: boolean | null;
  is_batch_composition_invariant?: boolean | null;
}

export interface UnitNormVectorCheck {
  label: string;
  strength?: number | null;
  norm?: number | null;
  deviation?: number | null;
  is_valid: boolean;
  issue?: string | null;
}

export interface UnitNormValidationDetail extends MetricEvaluationDetail {
  original_norm?: number | null;
  steered_norms: UnitNormVectorCheck[];
  valid_count: number;
  invalid_count: number;
  total_tested: number;
  tolerance: number;
  min_norm?: number | null;
  max_norm?: number | null;
  max_deviation?: number | null;
  nan_count: number;
  inf_count: number;
  zero_vector_count: number;
  wrong_dim_count: number;
}

export interface DisplacementStepAlignment {
  strength: number;
  vector_id: string;
  intended_sign: number;
  alignment?: number | null;
  displacement_norm: number;
  is_zero_displacement: boolean;
}

export interface DisplacementAlignmentDetail extends MetricEvaluationDetail {
  concept: ConceptId;
  positive_mean_alignment?: number | null;
  negative_mean_alignment?: number | null;
  zero_strength_handled: boolean;
  original_vector_id: string;
  step_alignments: DisplacementStepAlignment[];
}

export interface RepeatabilityDetail extends MetricEvaluationDetail {
  runs: number;
  max_vector_diff?: number | null;
  mean_vector_diff?: number | null;
  min_vector_cosine?: number | null;
  max_displacement_diff?: number | null;
  is_consistent?: boolean | null;
}

export interface EvaluateResponse {
  input_text: string;
  concept: ConceptId;
  base_concept_score: number;
  steps: EvaluationStep[];
  metrics_summary: {
    monotonicity: {
      is_monotonic: boolean;
      spearman_correlation: number | null;
      pearson_correlation: number | null;
      directional_consistency: number | null;
    };
    preservation_retention: {
      mean_preservation: number;
      min_preservation: number;
      preservation_decay_rate: number;
    };
    stability_summary: {
      mean_neighbor_stability: number;
      min_neighbor_stability: number;
      retained_original_neighbors_at_max: number;
    };
    linearity_score: number | null;
    umap_trustworthiness?: number | null;
    umap_trustworthiness_detail?: MetricEvaluationDetail | null;
    umap_continuity_2d?: MetricEvaluationDetail | null;
    umap_continuity_3d?: MetricEvaluationDetail | null;
    neighborhood_overlap_2d_3d?: NeighborhoodOverlapDetail | null;
    projection_distortion_2d?: ProjectionDistortionDetail | null;
    projection_distortion_3d?: ProjectionDistortionDetail | null;
    transform_stability?: TransformStabilityDetail | null;
    unit_norm_validation?: UnitNormValidationDetail | null;
    vector_displacement_alignment?: DisplacementAlignmentDetail | null;
    steering_repeatability?: RepeatabilityDetail | null;
  };
}

/**
 * Standard Error Envelope (4xx / 5xx)
 */
export interface ApiErrorDetail {
  field?: string;
  issue: string;
  value?: unknown;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    status: number;
    timestamp: string;
    details?: ApiErrorDetail[];
  };
}

/**
 * UI Request Lifecycle State
 */
export interface ApiStatus {
  status: 'idle' | 'loading' | 'success' | 'error';
  error: string | null;
}

export type SentimentLabel = 'positive' | 'neutral' | 'negative';
export type HumanSentimentLabel = 'positive' | 'neutral' | 'negative' | 'mixed' | 'uncertain';
export type EmotionCategory =
  | 'joy'
  | 'sadness'
  | 'anger'
  | 'fear'
  | 'surprise'
  | 'disgust'
  | 'love'
  | 'neutral'
  | 'other'
  | 'uncertain';
export type ReviewStatus = 'unreviewed' | 'confirmed' | 'corrected' | 'flagged_uncertain';
export type ReviewAction = 'confirm' | 'correct' | 'flag_uncertain';

export interface SentimentPrediction {
  predicted_label: SentimentLabel;
  effective_label: string;
  probabilities: {
    positive: number;
    neutral: number;
    negative: number;
  };
  confidence: number;
  margin: number;
  is_uncertain: boolean;
  uncertainty_reason?: string | null;
  model_name: string;
}

export interface EmotionProbabilityItem {
  label: string;
  category: EmotionCategory;
  probability: number;
}

export interface EmotionPrediction {
  predicted_emotion: EmotionCategory;
  raw_top_label: string;
  raw_top_category: EmotionCategory;
  confidence: number;
  margin: number;
  is_uncertain: boolean;
  uncertainty_reason?: string | null;
  probabilities: EmotionProbabilityItem[];
  taxonomy_note: string;
  model_name: string;
}

export interface EnrichedNeighborItem extends NearestNeighborItem {
  sentiment_label?: SentimentLabel | null;
  emotion_label?: EmotionCategory | null;
  emotion_raw_label?: string | null;
  emotion_confidence?: number | null;
  human_emotion_label?: EmotionCategory | null;
  human_emotion_distribution?: HumanEmotionDistributionItem[];
  human_sentiment_label?: HumanSentimentLabel | null;
}

export interface HumanEmotionOverlay {
  review_status: ReviewStatus;
  human_emotion_label?: EmotionCategory | null;
  human_emotion_distribution: HumanEmotionDistributionItem[];
  human_sentiment_label?: HumanSentimentLabel | null;
  confirmed_for_evaluation?: boolean;
  rationale?: string | null;
  reviewed_at?: string | null;
  revision?: number;
  history_count: number;
}

export interface EmotionAnalyzeRequest {
  text: string;
  concept?: ConceptId;
  top_k_neighbors?: number;
  include_embeddings?: boolean;
}

export interface EmotionAnalyzeResponse {
  record_id: string;
  input_text: string;
  sentiment: SentimentPrediction;
  emotion: EmotionPrediction;
  embedding_info: {
    model_name: string;
    dimensions: number;
    normalized: boolean;
    umap_coordinates: Coordinate3D;
    concept: ConceptId;
    concept_score: number;
    embedding: number[] | null;
  };
  nearest_neighbors: EnrichedNeighborItem[];
  review: HumanEmotionOverlay;
  created_at: string;
}

export interface EmotionReviewRequest {
  record_id: string;
  action: ReviewAction;
  human_emotion_label?: EmotionCategory | null;
  human_emotion_distribution?: HumanEmotionDistributionItem[];
  human_sentiment_label?: HumanSentimentLabel | null;
  rationale?: string | null;
}

export interface EmotionReviewHistoryItem {
  history_id: string;
  record_id: string;
  revision: number;
  previous_status: ReviewStatus;
  new_status: ReviewStatus;
  previous_human_emotion?: EmotionCategory | null;
  new_human_emotion: EmotionCategory;
  previous_human_distribution?: HumanEmotionDistributionItem[];
  new_human_distribution?: HumanEmotionDistributionItem[];
  previous_human_sentiment?: HumanSentimentLabel | null;
  new_human_sentiment?: HumanSentimentLabel | null;
  action: ReviewAction;
  rationale?: string | null;
  reviewed_at: string;
}

export interface EmotionReviewResponse {
  record_id: string;
  input_text: string;
  original_sentiment: SentimentPrediction;
  original_emotion: EmotionPrediction;
  umap_coordinates: Coordinate3D;
  review: HumanEmotionOverlay;
  history: EmotionReviewHistoryItem[];
}

export interface HumanEmotionEvaluationRecord {
  record_id: string;
  input_text: string;
  review_status: ReviewStatus;
  model_predicted_emotion: EmotionCategory;
  model_confidence: number;
  model_predicted_sentiment?: SentimentLabel | null;
  dominant_human_emotion: EmotionCategory;
  human_emotion_distribution: HumanEmotionDistributionItem[];
  human_sentiment_label?: HumanSentimentLabel | null;
  is_mixed_human_distribution: boolean;
  dominant_agreement: boolean;
  model_top1_in_human_multilabel: boolean;
  soft_overlap_score: number;
  reviewed_at?: string | null;
  revision: number;
}

export interface HumanEmotionEvaluationSummary {
  total_records: number;
  confirmed_ground_truth_count: number;
  confirmed_count: number;
  corrected_count: number;
  excluded_uncertain_count: number;
  excluded_unreviewed_count: number;
  mixed_distribution_count: number;
  single_emotion_count: number;
  dominant_top1_agreement?: number | null;
  multilabel_target_coverage?: number | null;
  mean_soft_distribution_overlap?: number | null;
  methodology: string;
  limitations: string;
  records: HumanEmotionEvaluationRecord[];
}
