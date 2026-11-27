# VectiQ API Integration Contract
**Version:** 1.0.0  
**Status:** Canonical / Single Source of Truth  
**Target Environments:** React + TypeScript (Frontend) & Python + FastAPI (Backend)  
**Base URL:** `/api/v1` (Default local: `http://localhost:8000/api/v1`)

---

## 1. Architectural Principles & Specifications

This document defines the strict, binding integration contract between the frontend and backend of **VectiQ (Semantic Space Studio)**.

### 1.1 Separation of Concerns
1. **Backend Role:** The backend owns 100% of machine learning, embedding generation, concept direction extraction, vector steering, mathematical distance/similarity calculations, dimensionality reduction projections (UMAP), and quantitative evaluations.
2. **Frontend Role:** The frontend is strictly a visualization and interaction layer. It never computes embeddings, steering vectors, or dimensional projections client-side; it receives and renders pre-calculated coordinates, metrics, and vector attributes supplied by the backend.

### 1.2 Model & Vector Standards
- **Embedding Model:** `sentence-transformers/all-MiniLM-L6-v2`
- **Embedding Dimensions:** Exactly `384` floating-point numbers (`float32`).
- **Vector Normalization:** All text embeddings produced by the model are $L_2$-normalized ($\|v\|_2 = 1.0$).
- **Vector Calculations:** All core mathematical computations (steering, cosine similarity, Euclidean displacement, nearest neighbor retrieval) operate strictly on the original **384-dimensional** embedding vectors, never on low-dimensional projection coordinates.

### 1.3 Concept Steering Standards
- **Supported Concepts (Enum):**
  - `positive_sentiment`: Steers text between negative/neutral and positive emotional valence.
  - `technical_tone`: Steers text between colloquial/simplistic and rigorous engineering/scientific phrasing.
  - `formal_tone`: Steers text between casual/informal and executive/academic professionalism.
- **Steering Strength Range:** `[-1.0, 1.0]` (floating point, step `0.05` recommended for UI sliders).
  - Negative values (`-1.0` to `< 0.0`) steer away from the concept vector.
  - Value `0.0` represents the neutral baseline (unsteered original embedding).
  - Positive values (`> 0.0` to `1.0`) steer towards the concept vector.

### 1.4 Projection & Spatial Coordinates (UMAP)
- **Fitted Projection:** The backend maintains **one consistent, pre-fitted UMAP projection model** trained on the canonical reference semantic corpus.
- **Transform Operation:** All new query embeddings, steered embeddings, and trajectory points must be transformed through `umap_model.transform(vector_384d)` to guarantee consistent spatial coordinates without re-fitting or spatial distortion.
- **Dimensionality:** 3-dimensional projection coordinates (`x`, `y`, `z`) are returned for 3D visualization in Plotly.js / WebGL.

---

## 2. Common Data Types & Schemas

### 2.1 Coordinate3D
Represents projected coordinates in 3-dimensional visualization space.
```json
{
  "x": 1.4523,
  "y": -0.8912,
  "z": 2.1045
}
```
| Field | Type | Description |
| :--- | :--- | :--- |
| `x` | `float` | Projected X-axis coordinate in semantic space |
| `y` | `float` | Projected Y-axis coordinate in semantic space |
| `z` | `float` | Projected Z-axis coordinate in semantic space |

### 2.2 NearestNeighborItem
A reference corpus item identified as a nearest neighbor in 384-dimensional space.
```json
{
  "id": "corpus_042",
  "text": "The neural network convergence rate exceeded benchmarks.",
  "category": "technical",
  "cosine_similarity": 0.8841,
  "euclidean_distance": 0.4815,
  "coordinates": {
    "x": 1.421,
    "y": -0.875,
    "z": 2.089
  }
}
```
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Unique identifier of the reference corpus item |
| `text` | `string` | Content string of the neighbor item |
| `category` | `string` | Cluster or semantic category tag (e.g., `technical`, `casual`) |
| `cosine_similarity` | `float` | Cosine similarity to the query vector in 384D space (`[-1.0, 1.0]`) |
| `euclidean_distance` | `float` | Euclidean distance to the query vector in 384D space (`>= 0.0`) |
| `coordinates` | `Coordinate3D` | 3D projected coordinates for rendering in space |

### 2.3 Standard Error Format (`ErrorResponse`)
All endpoints return standard HTTP error envelopes on 4xx/5xx responses:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Input validation failed on one or more request fields.",
    "status": 422,
    "timestamp": "2026-11-27T12:00:00Z",
    "details": [
      {
        "field": "strength",
        "issue": "ensure this value is greater than or equal to -1.0",
        "value": -1.5
      }
    ]
  }
}
```

---

## 3. API Endpoints

### 3.1 GET `/api/v1/health`
Verifies backend service operational readiness, model initialization, and projection model state.

- **Method:** `GET`
- **Path:** `/api/v1/health`
- **Authentication:** None
- **Query Parameters:** None

#### Response (200 OK)
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "model_loaded": true,
  "umap_fitted": true,
  "corpus_size": 250,
  "timestamp": "2026-11-27T12:00:00Z"
}
```

| Field | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `status` | `string` | `"healthy"` \| `"degraded"` | Service status indicator |
| `version` | `string` | Semantic version string | Backend version |
| `model_loaded` | `boolean` | Must be `true` | Indicates `all-MiniLM-L6-v2` is loaded in memory |
| `umap_fitted` | `boolean` | Must be `true` | Indicates canonical UMAP projection model is fitted |
| `corpus_size` | `integer` | `>= 0` | Total baseline reference documents in semantic space |
| `timestamp` | `string` | ISO 8601 UTC | Server time of the health probe |

#### Error Responses
- `503 Service Unavailable`: If model or projection pipeline failed to initialize.

---

### 3.2 GET `/api/v1/config`
Retrieves system parameters, model metadata, supported steering concepts, and projection settings so the frontend dynamically configures UI components.

- **Method:** `GET`
- **Path:** `/api/v1/config`
- **Authentication:** None
- **Query Parameters:** None

#### Response (200 OK)
```json
{
  "model": {
    "name": "all-MiniLM-L6-v2",
    "dimensions": 384,
    "max_sequence_length": 256,
    "normalized_embeddings": true
  },
  "steering": {
    "min_strength": -1.0,
    "max_strength": 1.0,
    "default_strength": 0.0,
    "step": 0.05,
    "concepts": [
      {
        "id": "positive_sentiment",
        "label": "Positive Sentiment",
        "description": "Steers emotional valence towards optimism and constructive feedback.",
        "negative_label": "Negative Sentiment",
        "positive_label": "Positive Sentiment"
      },
      {
        "id": "technical_tone",
        "label": "Technical Tone",
        "description": "Steers phrasing towards analytical, specialized engineering terminology.",
        "negative_label": "Colloquial / Simple",
        "positive_label": "Technical / Analytical"
      },
      {
        "id": "formal_tone",
        "label": "Formal Tone",
        "description": "Steers tone towards executive, professional, and academic register.",
        "negative_label": "Casual / Informal",
        "positive_label": "Formal / Professional"
      }
    ]
  },
  "projection": {
    "method": "UMAP",
    "dimensions": 3,
    "n_neighbors": 15,
    "min_dist": 0.1,
    "metric": "cosine"
  }
}
```

| Field | Type | Description |
| :--- | :--- | :--- |
| `model.name` | `string` | Exact identifier of embedding model (`all-MiniLM-L6-v2`) |
| `model.dimensions` | `integer` | Vector dimension (`384`) |
| `steering.min_strength` | `float` | Minimum steering limit (`-1.0`) |
| `steering.max_strength` | `float` | Maximum steering limit (`1.0`) |
| `steering.concepts` | `ConceptMetadata[]` | Array of concept descriptors for UI selectors and tooltips |
| `projection.dimensions` | `integer` | Spatial dimensions for 3D visualizer (`3`) |

---

### 3.3 GET `/api/v1/semantic-map`
Fetches the pre-computed base semantic space consisting of reference corpus nodes, clusters, and coordinate bounds. Used to render the static background galaxy in the 3D visualizer.

- **Method:** `GET`
- **Path:** `/api/v1/semantic-map`
- **Query Parameters:**
  - `include_embeddings` (`boolean`, optional, default: `false`): When `false`, excludes large 384D float arrays to optimize network payload.
  - `category` (`string`, optional): Filter nodes by semantic cluster category.
  - `limit` (`integer`, optional, default: `250`, max: `1000`): Maximum corpus points returned.

#### Response (200 OK)
```json
{
  "total_points": 3,
  "bounds": {
    "x_min": -5.21,
    "x_max": 6.84,
    "y_min": -4.12,
    "y_max": 5.91,
    "z_min": -3.55,
    "z_max": 4.88
  },
  "clusters": [
    {
      "id": "sentiment",
      "label": "Sentiment Domain",
      "color": "#38bdf8",
      "point_count": 1
    },
    {
      "id": "technical",
      "label": "Engineering & Computing",
      "color": "#a855f7",
      "point_count": 1
    },
    {
      "id": "formal",
      "label": "Corporate & Legal",
      "color": "#10b981",
      "point_count": 1
    }
  ],
  "points": [
    {
      "id": "corp_001",
      "text": "The experiment yielded outstanding and joyful outcomes.",
      "category": "sentiment",
      "coordinates": {
        "x": 2.451,
        "y": 1.102,
        "z": -0.844
      },
      "concept_scores": {
        "positive_sentiment": 0.82,
        "technical_tone": 0.15,
        "formal_tone": 0.44
      },
      "embedding": null
    },
    {
      "id": "corp_002",
      "text": "Vector matrix decomposition minimizes dimensional entropy.",
      "category": "technical",
      "coordinates": {
        "x": -3.125,
        "y": 4.221,
        "z": 1.776
      },
      "concept_scores": {
        "positive_sentiment": 0.05,
        "technical_tone": 0.94,
        "formal_tone": 0.61
      },
      "embedding": null
    },
    {
      "id": "corp_003",
      "text": "We hereby acknowledge receipt of your correspondence.",
      "category": "formal",
      "coordinates": {
        "x": 0.812,
        "y": -2.941,
        "z": 3.109
      },
      "concept_scores": {
        "positive_sentiment": 0.22,
        "technical_tone": 0.10,
        "formal_tone": 0.91
      },
      "embedding": null
    }
  ]
}
```

---

### 3.4 POST `/api/v1/steer`
Computes the original text embedding, derives the steered embedding along the target concept axis at the given strength, projects both points via the fitted UMAP mapper, and calculates spatial movement, nearest neighbors, and semantic preservation metrics.

- **Method:** `POST`
- **Path:** `/api/v1/steer`
- **Headers:** `Content-Type: application/json`

#### Request Body
```json
{
  "text": "The code runs fast and without any problems.",
  "concept": "technical_tone",
  "strength": 0.65,
  "top_k_neighbors": 5,
  "include_embeddings": true
}
```

| Field | Type | Required | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `text` | `string` | **Yes** | `1 <= length <= 1000` | Input text to be embedded and steered |
| `concept` | `string` | **Yes** | Enum: `positive_sentiment`, `technical_tone`, `formal_tone` | Semantic concept vector direction |
| `strength` | `float` | **Yes** | `-1.0 <= value <= 1.0` | Steering multiplier $\lambda$ |
| `top_k_neighbors` | `integer` | No | `1 <= value <= 20`, default: `5` | Count of nearest reference neighbors to return |
| `include_embeddings`| `boolean` | No | default: `true` | Whether to return the 384D float arrays in payload |

#### Mathematical Implementation Spec (Backend):
1. **Original Embedding:** $v_{orig} = \text{normalize}(\text{embed}(\text{text})) \in \mathbb{R}^{384}$.
2. **Steering Vector:** Let $c \in \mathbb{R}^{384}$ be the pre-computed unit concept direction for `concept`.
3. **Steering Operation:** $v_{steered} = \text{normalize}(v_{orig} + \lambda \cdot c)$, where $\lambda = \text{strength}$.
4. **Projection:** $P_{orig} = \text{umap.transform}(v_{orig})$, $P_{steered} = \text{umap.transform}(v_{steered}) \in \mathbb{R}^3$.
5. **Preservation:** $\text{cosine\_similarity}(v_{orig}, v_{steered}) = v_{orig} \cdot v_{steered}$.

#### Response (200 OK)
```json
{
  "input_text": "The code runs fast and without any problems.",
  "concept": "technical_tone",
  "strength": 0.65,
  "original": {
    "coordinates": {
      "x": -0.452,
      "y": 1.284,
      "z": 0.319
    },
    "concept_score": 0.3421,
    "nearest_neighbors": [
      {
        "id": "corp_012",
        "text": "Application performance is optimal under benchmark load.",
        "category": "technical",
        "cosine_similarity": 0.8124,
        "euclidean_distance": 0.6125,
        "coordinates": {
          "x": -0.512,
          "y": 1.341,
          "z": 0.355
        }
      }
    ],
    "embedding": [0.0312, -0.0145, 0.0891, "/* ... 384 float values total ... */"]
  },
  "steered": {
    "coordinates": {
      "x": -1.214,
      "y": 2.105,
      "z": 1.048
    },
    "concept_score": 0.8247,
    "nearest_neighbors": [
      {
        "id": "corp_002",
        "text": "Vector matrix decomposition minimizes dimensional entropy.",
        "category": "technical",
        "cosine_similarity": 0.8912,
        "euclidean_distance": 0.4664,
        "coordinates": {
          "x": -1.185,
          "y": 2.081,
          "z": 1.012
        }
      }
    ],
    "embedding": [0.0189, 0.0412, 0.1245, "/* ... 384 float values total ... */"]
  },
  "movement": {
    "euclidean_distance_384d": 0.5284,
    "cosine_distance_384d": 0.1396,
    "angle_radians": 0.5352,
    "angle_degrees": 30.665,
    "coordinate_shift": {
      "dx": -0.762,
      "dy": 0.821,
      "dz": 0.729,
      "projection_displacement": 1.339
    },
    "trajectory_vector_384d": [-0.0232, 0.1051, 0.0667, "/* ... 384 float values ... */"]
  },
  "preservation": {
    "semantic_preservation_score": 0.8604,
    "magnitude_drift": 0.0,
    "cosine_similarity": 0.8604
  },
  "concept_metrics": {
    "original_score": 0.3421,
    "steered_score": 0.8247,
    "delta": 0.4826,
    "target_alignment": 0.8247
  }
}
```

| Response Section | Field | Type | Description |
| :--- | :--- | :--- | :--- |
| `original` | `concept_score` | `float` | Projection onto target concept axis before steering (`[-1.0, 1.0]`) |
| `original` | `nearest_neighbors` | `NearestNeighborItem[]` | Closest corpus documents to unsteered embedding |
| `steered` | `concept_score` | `float` | Projection onto target concept axis after steering (`[-1.0, 1.0]`) |
| `movement` | `euclidean_distance_384d`| `float` | $\|v_{steered} - v_{orig}\|_2$ in 384-dimensional space |
| `movement` | `angle_degrees` | `float` | Angular divergence in degrees between original and steered vectors |
| `movement` | `coordinate_shift` | `object` | Low-dimensional $(\Delta x, \Delta y, \Delta z)$ shift in UMAP space |
| `preservation`| `semantic_preservation_score` | `float` | Cosine similarity $v_{orig} \cdot v_{steered} \in [0.0, 1.0]$ |
| `preservation`| `magnitude_drift` | `float` | Relative norm change $(\|v_{steered}\| - \|v_{orig}\|)/\|v_{orig}\|$ (equals `0.0` for normalized vectors) |
| `concept_metrics` | `delta` | `float` | `steered_score - original_score` |

#### Error Responses
- `422 Unprocessable Entity`: Validation error (e.g., strength `< -1.0` or `> 1.0`, text empty or $> 1000$ characters, invalid concept string).
- `400 Bad Request`: Malformed JSON payload.
- `500 Internal Server Error`: Model inference failure.

---

### 3.5 POST `/api/v1/evaluate`
Performs multi-step steering across an array of steering strengths. Evaluates trajectory linearity, semantic preservation decay, concept score monotonicity, and neighbor set stability.

- **Method:** `POST`
- **Path:** `/api/v1/evaluate`
- **Headers:** `Content-Type: application/json`

#### Request Body
```json
{
  "text": "The system architecture is simple, direct, and fast.",
  "concept": "formal_tone",
  "strengths": [-1.0, -0.75, -0.5, -0.25, 0.0, 0.25, 0.5, 0.75, 1.0],
  "top_k_neighbors": 5
}
```

| Field | Type | Required | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `text` | `string` | **Yes** | `1 <= length <= 1000` | Input text to evaluate |
| `concept` | `string` | **Yes** | Enum: `positive_sentiment`, `technical_tone`, `formal_tone` | Target concept direction |
| `strengths` | `float[]` | No | Min items: `3`, Max items: `21`. Each value in `[-1.0, 1.0]`. Default: `[-1.0, -0.75, -0.5, -0.25, 0.0, 0.25, 0.5, 0.75, 1.0]` | Array of steering strengths to sample |
| `top_k_neighbors` | `integer`| No | `1 <= value <= 20`, default: `5` | Top-K neighbor count used for neighbor stability metric |

#### Evaluation Metrics Definition (Backend):
1. **Concept Score:** $s(\lambda) = v(\lambda) \cdot c$, where $c$ is the unit concept vector.
2. **Semantic Preservation:** $P(\lambda) = v(0) \cdot v(\lambda)$ (cosine similarity relative to neutral baseline $v(0)$).
3. **Neighbor Stability:** Jaccard similarity index between top-$k$ nearest neighbors of unsteered vector $N_0$ and steered vector $N_\lambda$:
   $$\text{stability}(\lambda) = \frac{|N_0 \cap N_\lambda|}{|N_0 \cup N_\lambda|} \in [0.0, 1.0]$$
4. **Monotonicity:**
   - **`spearman_correlation`**: Spearman rank correlation between $\lambda$ and $s(\lambda)$. A value near $+1.0$ indicates perfect monotonic progression.
   - **`is_monotonic`**: `true` if $s(\lambda_{i+1}) \ge s(\lambda_i)$ for all sorted $\lambda_i$.
   - **`directional_consistency`**: Fraction of adjacent intervals $[s(\lambda_i), s(\lambda_{i+1})]$ where sign of slope matches sign of $\Delta \lambda$.

#### Response (200 OK)
```json
{
  "input_text": "The system architecture is simple, direct, and fast.",
  "concept": "formal_tone",
  "base_concept_score": 0.2814,
  "steps": [
    {
      "strength": -1.0,
      "concept_score": -0.6241,
      "semantic_preservation": 0.6912,
      "neighbor_stability": 0.1111,
      "coordinates": {
        "x": -2.814,
        "y": -1.241,
        "z": -0.512
      },
      "nearest_neighbors": [
        {
          "id": "corp_091",
          "text": "Yeah whatever works bro, just push it.",
          "category": "casual",
          "cosine_similarity": 0.7812,
          "euclidean_distance": 0.6615,
          "coordinates": {
            "x": -2.750,
            "y": -1.180,
            "z": -0.490
          }
        }
      ]
    },
    {
      "strength": -0.5,
      "concept_score": -0.1984,
      "semantic_preservation": 0.8821,
      "neighbor_stability": 0.4286,
      "coordinates": {
        "x": -1.412,
        "y": -0.612,
        "z": 0.115
      },
      "nearest_neighbors": []
    },
    {
      "strength": 0.0,
      "concept_score": 0.2814,
      "semantic_preservation": 1.0,
      "neighbor_stability": 1.0,
      "coordinates": {
        "x": 0.012,
        "y": 0.025,
        "z": 0.812
      },
      "nearest_neighbors": []
    },
    {
      "strength": 0.5,
      "concept_score": 0.6451,
      "semantic_preservation": 0.8795,
      "neighbor_stability": 0.3333,
      "coordinates": {
        "x": 1.341,
        "y": 0.789,
        "z": 1.542
      },
      "nearest_neighbors": []
    },
    {
      "strength": 1.0,
      "concept_score": 0.8912,
      "semantic_preservation": 0.7104,
      "neighbor_stability": 0.1111,
      "coordinates": {
        "x": 2.715,
        "y": 1.512,
        "z": 2.314
      },
      "nearest_neighbors": [
        {
          "id": "corp_003",
          "text": "We hereby acknowledge receipt of your correspondence.",
          "category": "formal",
          "cosine_similarity": 0.8654,
          "euclidean_distance": 0.5188,
          "coordinates": {
            "x": 2.650,
            "y": 1.480,
            "z": 2.290
          }
        }
      ]
    }
  ],
  "metrics_summary": {
    "monotonicity": {
      "is_monotonic": true,
      "spearman_correlation": 1.0,
      "pearson_correlation": 0.9942,
      "directional_consistency": 1.0
    },
    "preservation_retention": {
      "mean_preservation": 0.8326,
      "min_preservation": 0.6912,
      "preservation_decay_rate": 0.3088
    },
    "stability_summary": {
      "mean_neighbor_stability": 0.3968,
      "min_neighbor_stability": 0.1111,
      "retained_original_neighbors_at_max": 1
    },
    "linearity_score": 0.9884,
    "umap_trustworthiness": 0.938619
  }
}
```

| Summary Section | Metric | Type | Description |
| :--- | :--- | :--- | :--- |
| `monotonicity` | `is_monotonic` | `boolean` | `true` if concept scores are strictly non-decreasing with strength |
| `monotonicity` | `spearman_correlation` | `float` | Rank correlation coefficient (`[-1.0, 1.0]`) |
| `monotonicity` | `pearson_correlation` | `float` | Linear correlation coefficient between strength and concept score |
| `monotonicity` | `directional_consistency`| `float` | Ratio of step segments advancing towards target direction (`[0.0, 1.0]`) |
| `preservation_retention` | `mean_preservation` | `float` | Average cosine preservation across all tested strengths |
| `preservation_retention` | `min_preservation` | `float` | Worst-case semantic preservation across tested range |
| `stability_summary` | `mean_neighbor_stability` | `float` | Average Jaccard neighborhood overlap index |
| `stability_summary` | `min_neighbor_stability` | `float` | Minimum neighborhood overlap across range |
| `metrics_summary` | `linearity_score` | `float` | $R^2$ linear fit coefficient of concept score vs. steering strength |
| `metrics_summary` | `umap_trustworthiness` | `float` | UMAP projection trustworthiness score, measuring how well local neighborhood relationships are preserved in the low-dimensional projection. Expected range: `[0.0, 1.0]`. |

---

## 4. HTTP Status Codes & Error Mapping

| Status Code | Reason | Cause |
| :--- | :--- | :--- |
| `200 OK` | Success | Request succeeded and body returned. |
| `400 Bad Request` | Client Error | Malformed JSON body or unparseable payload. |
| `422 Unprocessable Entity` | Validation Error | Field constraint violation (e.g. strength out of range `[-1.0, 1.0]`, text too long, invalid concept enum). |
| `500 Internal Server Error` | Server Error | Unhandled exception during vector calculation or model forward pass. |
| `503 Service Unavailable` | Engine Unavailable | Model or UMAP projection index is not loaded in memory. |

---

## 5. TypeScript Reference Types (For Frontend)

The frontend developer can paste or import the following interfaces into `src/types/api.ts`:

```typescript
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

export interface HealthResponse {
  status: 'healthy' | 'degraded';
  version: string;
  model_loaded: boolean;
  umap_fitted: boolean;
  corpus_size: number;
  timestamp: string;
}

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
```

---

## 6. Pydantic Reference Models (For Backend)

The backend developer can implement these schemas in `app/schemas/` using Pydantic v2:

```python
from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

class ConceptEnum(str, Enum):
    positive_sentiment = "positive_sentiment"
    technical_tone = "technical_tone"
    formal_tone = "formal_tone"

class Coordinate3D(BaseModel):
    x: float
    y: float
    z: float

class NearestNeighborItem(BaseModel):
    id: str
    text: str
    category: str
    cosine_similarity: float
    euclidean_distance: float
    coordinates: Coordinate3D

class SteerRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=1000, description="Input text to steer")
    concept: ConceptEnum
    strength: float = Field(..., ge=-1.0, le=1.0, description="Steering factor between -1.0 and +1.0")
    top_k_neighbors: int = Field(5, ge=1, le=20)
    include_embeddings: bool = Field(True, description="Whether to include 384d raw float embeddings")

class EvaluateRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=1000)
    concept: ConceptEnum
    strengths: Optional[List[float]] = Field(
        default=[-1.0, -0.75, -0.5, -0.25, 0.0, 0.25, 0.5, 0.75, 1.0],
        min_length=3,
        max_length=21
    )
    top_k_neighbors: int = Field(5, ge=1, le=20)
```
