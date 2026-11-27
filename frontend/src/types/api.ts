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
export interface SemanticMapQueryParams {
  include_embeddings?: boolean;
  category?: string;
  limit?: number;
}

export interface SemanticMapPoint {
  id: string;
  text: string;
  category: string;
  coordinates: Coordinate3D;
  concept_scores: Record<ConceptId, number>;
  embedding: number[] | null;
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
}

export interface EvaluationStep {
  strength: number;
  concept_score: number;
  semantic_preservation: number;
  neighbor_stability: number;
  coordinates: Coordinate3D;
  nearest_neighbors: NearestNeighborItem[];
}

export interface EvaluateResponse {
  input_text: string;
  concept: ConceptId;
  base_concept_score: number;
  steps: EvaluationStep[];
  metrics_summary: {
    monotonicity: {
      is_monotonic: boolean;
      spearman_correlation: number;
      pearson_correlation: number;
      directional_consistency: number;
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
    linearity_score: number;
    umap_trustworthiness?: number | null;
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
