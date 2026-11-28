export type GlossaryCategoryId =
  | 'embedding'
  | 'similarity'
  | 'steering'
  | 'umap'
  | 'evaluation'
  | 'affect';

export interface GlossaryCategoryMeta {
  id: GlossaryCategoryId;
  shortLabel: string;
  label: string;
}

export interface GlossaryEntry {
  id: string;
  category: GlossaryCategoryId;
  parameterName: string;
  simpleExplanation: string;
  technicalExplanation: string;
  formulaOrExample: string;
  copyableFormula?: string;
  whereUsed: string[];
  notImplemented?: boolean;
}

export const GLOSSARY_CATEGORIES: GlossaryCategoryMeta[] = [
  { id: 'embedding', shortLabel: 'A. Embedding', label: 'A. Embedding Parameters' },
  { id: 'similarity', shortLabel: 'B. Similarity', label: 'B. Similarity Parameters' },
  { id: 'steering', shortLabel: 'C. Steering', label: 'C. Vector Steering Parameters' },
  { id: 'umap', shortLabel: 'D. UMAP', label: 'D. UMAP Parameters' },
  { id: 'evaluation', shortLabel: 'E. Evaluation', label: 'E. Evaluation Parameters' },
  { id: 'affect', shortLabel: 'F. Affect', label: 'F. Sentiment & Emotion Parameters' },
];

export const GLOSSARY_ENTRIES: GlossaryEntry[] = [
  // A. Embedding Parameters
  {
    id: 'emb-model',
    category: 'embedding',
    parameterName: 'Embedding Model (all-MiniLM-L6-v2)',
    simpleExplanation:
      'The frozen neural sentence encoder that turns English sentences into numeric meaning vectors without rewriting text.',
    technicalExplanation:
      'Pretrained sentence-transformers/all-MiniLM-L6-v2 transformer loaded once at FastAPI startup with max_sequence_length = 256 wordpiece tokens (configured via backend Settings.model_name).',
    formulaOrExample: 'text (≤ 256 tokens) → SentenceTransformer.encode() → E ∈ ℝ³⁸⁴',
    copyableFormula: 'E = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2").encode(text)',
    whereUsed: ['Semantic Explorer', 'Vector Steering', 'Comparison Lab', 'Evaluation Dashboard'],
  },
  {
    id: 'emb-dimensions',
    category: 'embedding',
    parameterName: 'Embedding Dimensions (384D)',
    simpleExplanation:
      'The number of numeric coordinates VectiQ uses to represent the meaning of every sentence.',
    technicalExplanation:
      'Fixed output dimensionality settings.embedding_dimension = 384 enforced in EmbeddingService, SteeringService, and /api/v1/config.',
    formulaOrExample: 'dim(E) = 384 (each vector has 384 scalar components E₀ … E₃₈₃)',
    copyableFormula: 'E.shape == (384,)',
    whereUsed: ['Overview', 'Semantic Explorer', 'Vector Steering', 'Comparison Lab', 'Evaluation Dashboard'],
  },
  {
    id: 'emb-float32',
    category: 'embedding',
    parameterName: 'Float32 Representation',
    simpleExplanation:
      'Standard 32-bit decimal precision used to store and steer all 384 embedding numbers.',
    technicalExplanation:
      'Embeddings returned by EmbeddingService and stored in corpus_embeddings.npy use np.float32; raw norm auditing promotes copies to float64 internally to avoid accumulation rounding error.',
    formulaOrExample: 'dtype(E) = np.float32; norm audit in np.float64',
    copyableFormula: 'np.asarray(embedding, dtype=np.float32)',
    whereUsed: ['Semantic Explorer', 'Vector Steering', 'Comparison Lab', 'Evaluation Dashboard'],
  },
  {
    id: 'emb-l2-norm',
    category: 'embedding',
    parameterName: 'L2 Normalization',
    simpleExplanation:
      'Scales every embedding arrow to exact length 1.0 so direction captures meaning cleanly.',
    technicalExplanation:
      'safe_l2_normalize divides vectors with ||v||₂ > 1e-12 by their Euclidean norm while guarding against zero vectors without mutating caller arrays.',
    formulaOrExample: 'normalize(v) = v / ||v||₂   when ||v||₂ > 10⁻¹²',
    copyableFormula: 'v_norm = v / max(sqrt(sum(v_i^2)), 1e-12)',
    whereUsed: ['Semantic Explorer', 'Vector Steering', 'Comparison Lab', 'Evaluation Dashboard'],
  },
  {
    id: 'emb-original',
    category: 'embedding',
    parameterName: 'Original Embedding (E)',
    simpleExplanation:
      'The starting 384D vector representing your unedited sentence before steering.',
    technicalExplanation:
      'Unit-normalized 384D vector returned in original.embedding on POST /api/v1/steer and kept completely unchanged when steering strength α = 0.',
    formulaOrExample: 'E = normalize(encode(input_text)),   ||E||₂ = 1.0',
    copyableFormula: 'E = safe_l2_normalize(embedding_service.encode_text(text))',
    whereUsed: ['Semantic Explorer', 'Vector Steering', 'Comparison Lab', 'Evaluation Dashboard'],
  },
  {
    id: 'emb-modified',
    category: 'embedding',
    parameterName: "Modified Embedding (E')",
    simpleExplanation:
      'The new 384D vector produced after sliding your sentence along a chosen concept axis.',
    technicalExplanation:
      'Steered unit-normalized 384D output produced by SteeringService.steer_embedding(E, concept, α) and used for steered neighbor retrieval and UMAP projection.',
    formulaOrExample: "E' = normalize(E + α · D),   ||E'||₂ = 1.0",
    copyableFormula: "E' = normalize(E + alpha * D)",
    whereUsed: ['Vector Steering', 'Comparison Lab', 'Evaluation Dashboard'],
  },

  // B. Similarity Parameters
  {
    id: 'sim-cosine',
    category: 'similarity',
    parameterName: 'Cosine Similarity',
    simpleExplanation:
      'Measures how closely two sentences point in the same meaning direction (−1 opposite to +1 identical).',
    technicalExplanation:
      'safe_cosine_similarity(a, b) computes clip(dot(a, b) / (||a||₂ · ||b||₂), -1, 1), returning 0.0 for zero-norm inputs. Powers concept alignment, semantic preservation, and corpus retrieval.',
    formulaOrExample: 'cos(A, B) = (A · B) / (||A||₂ ||B||₂) ∈ [-1.0, +1.0]',
    copyableFormula: 'cos(A, B) = dot(A, B) / (norm(A) * norm(B))',
    whereUsed: ['Semantic Explorer', 'Vector Steering', 'Comparison Lab', 'Evaluation Dashboard'],
  },
  {
    id: 'sim-cosine-distance',
    category: 'similarity',
    parameterName: 'Cosine Distance',
    simpleExplanation:
      'The angular gap between two normalized meaning vectors (0 means identical direction).',
    technicalExplanation:
      'Computed as max(0.0, 1.0 - cos(E, E′)) in SteeringService movement metrics and as pairwise high-dimensional metric="cosine" in UMAP and projection distortion.',
    formulaOrExample: "d_cos(E, E') = max(0, 1 − cos(E, E'))",
    copyableFormula: "cosine_distance = max(0.0, 1.0 - cos(E, E'))",
    whereUsed: ['Vector Steering', 'Comparison Lab', 'Evaluation Dashboard'],
  },
  {
    id: 'sim-nn',
    category: 'similarity',
    parameterName: 'Nearest Neighbors',
    simpleExplanation:
      'The real dataset sentences whose meanings sit closest to a given vector in 384D space.',
    technicalExplanation:
      'SimilarityService.find_nearest_neighbors ranks all 360 records in backend/data/corpus.csv descending by exact 384D cosine similarity (mergesort, excluding exact query string matches).',
    formulaOrExample: 'argmax_{c ∈ Corpus, size=K} cos(query_384D, c_384D)',
    whereUsed: ['Semantic Explorer', 'Vector Steering', 'Comparison Lab', 'Evaluation Dashboard'],
  },
  {
    id: 'sim-topk',
    category: 'similarity',
    parameterName: 'Top-K (top_k_neighbors)',
    simpleExplanation:
      'Chooses how many closest dataset sentences VectiQ retrieves for inspection.',
    technicalExplanation:
      'Validated integer parameter (1 ≤ k ≤ 20, default 5 per config.default_top_k_neighbors) across /steer, /evaluate, and /emotions/analyze.',
    formulaOrExample: 'Default K = 5 (API permits 1 ≤ K ≤ 20; UI presets 3, 5, 10, 15)',
    copyableFormula: 'top_k_neighbors: 5  # allowed [1, 20]',
    whereUsed: ['Semantic Explorer', 'Vector Steering', 'Comparison Lab', 'Evaluation Dashboard'],
  },
  {
    id: 'sim-threshold',
    category: 'similarity',
    parameterName: 'Similarity Threshold',
    simpleExplanation:
      'Not currently implemented: VectiQ always returns your top-K closest neighbors without dropping results below a score cutoff.',
    technicalExplanation:
      'Not currently implemented in SimilarityService.find_nearest_neighbors: nearest-neighbor retrieval ranks strictly by cosine similarity and truncates at top_k_neighbors without a minimum similarity threshold.',
    formulaOrExample: 'Not currently implemented (returns top-K unconditionally)',
    whereUsed: ['Semantic Explorer', 'Vector Steering'],
    notImplemented: true,
  },
  {
    id: 'sim-overlap',
    category: 'similarity',
    parameterName: 'Neighborhood Overlap',
    simpleExplanation:
      'Shows how many nearest neighbors remain shared between two compared spaces or before vs. after steering.',
    technicalExplanation:
      'Measured via Jaccard index |A ∩ B| / |A ∪ B| before vs. after steering in 384D, and via (1/N)∑|N_k^{2D}(i) ∩ N_k^{3D}(i)| / k when comparing 2D vs. 3D projections.',
    formulaOrExample: 'Jaccard(A, B) = |A ∩ B| / |A ∪ B| ∈ [0.0, 1.0]',
    copyableFormula: 'jaccard = len(set_a & set_b) / len(set_a | set_b)',
    whereUsed: ['Comparison Lab', 'Evaluation Dashboard'],
  },

  // C. Vector Steering Parameters
  {
    id: 'steer-dir-d',
    category: 'steering',
    parameterName: 'Concept Direction (D)',
    simpleExplanation:
      'A unit direction pointing along an interpretable attribute like positive sentiment, technical tone, or formal tone.',
    technicalExplanation:
      'Post-hoc contrastive vector computed at startup per ConceptEnum (positive_sentiment, technical_tone, formal_tone) from curated corpus anchors without retraining MiniLM weights.',
    formulaOrExample: 'D = normalize(mean(P) − mean(N)),   ||D||₂ = 1.0',
    copyableFormula: 'D = normalize(mean(E_pos) - mean(E_neg))',
    whereUsed: ['Overview', 'Vector Steering', 'Comparison Lab', 'Evaluation Dashboard'],
  },
  {
    id: 'steer-pos-examples',
    category: 'steering',
    parameterName: 'Positive Examples (P)',
    simpleExplanation:
      'Curated reference sentences expressing the high end of an attribute (e.g., strongly formal or technical phrasing).',
    technicalExplanation:
      'Corpus records tagged "positive" in sentiment_anchor (30), technical_anchor (30), or formal_anchor (30) columns of backend/data/corpus.csv.',
    formulaOrExample: 'mean(P) = (1 / |P|) ∑_{i ∈ P} E_i   (|P| = 30 per concept)',
    whereUsed: ['Overview', 'Vector Steering'],
  },
  {
    id: 'steer-neg-examples',
    category: 'steering',
    parameterName: 'Negative Examples (N)',
    simpleExplanation:
      'Curated reference sentences representing the opposite pole (e.g., casual or colloquial phrasing).',
    technicalExplanation:
      'Corpus records tagged "negative" in corpus.csv: sentiment_anchor (30), technical_anchor (51), and formal_anchor (44).',
    formulaOrExample: 'mean(N) = (1 / |N|) ∑_{j ∈ N} E_j   (|N| ∈ {30, 51, 44})',
    whereUsed: ['Overview', 'Vector Steering'],
  },
  {
    id: 'steer-alpha',
    category: 'steering',
    parameterName: 'Steering Strength (α / λ)',
    simpleExplanation:
      'Controls how strongly the sentence vector moves toward (+) or away from (−) the selected concept direction.',
    technicalExplanation:
      'Scalar coefficient bounded to [-1.0, +1.0] (step 0.05, default 0.0 in CONTRACT_STEERING_BOUNDS) added to D before hypersphere L2 normalization (displayed as λ in UI charts/sliders).',
    formulaOrExample: "E' = normalize(E + α · D),   α ∈ [-1.0, +1.0]",
    copyableFormula: "E' = normalize(E + alpha * D)",
    whereUsed: ['Vector Steering', 'Comparison Lab', 'Evaluation Dashboard'],
  },
  {
    id: 'steer-positive',
    category: 'steering',
    parameterName: 'Positive Steering (α > 0)',
    simpleExplanation:
      'Shifts the embedding toward the concept’s positive pole (e.g., more technical or formal).',
    technicalExplanation:
      'Adds a positive scalar multiple +α·D to E and re-normalizes onto the 384D hypersphere, raising concept cosine alignment cos(E′, D).',
    formulaOrExample: "α > 0  ⇒  E' = normalize(E + α · D),   Δscore > 0",
    copyableFormula: "E' = normalize(E + (+abs(alpha)) * D)",
    whereUsed: ['Vector Steering', 'Comparison Lab', 'Evaluation Dashboard'],
  },
  {
    id: 'steer-negative',
    category: 'steering',
    parameterName: 'Negative Steering (α < 0)',
    simpleExplanation:
      'Shifts the embedding away from the concept toward its opposite pole (e.g., casual or colloquial).',
    technicalExplanation:
      'Adds a negative scalar multiple α·D (equivalent to −|α|·D) before L2 normalization, moving E′ toward the negative anchor centroid.',
    formulaOrExample: "α < 0  ⇒  E' = normalize(E − |α| · D),   Δscore < 0",
    copyableFormula: "E' = normalize(E - abs(alpha) * D)",
    whereUsed: ['Vector Steering', 'Comparison Lab', 'Evaluation Dashboard'],
  },
  {
    id: 'steer-zero',
    category: 'steering',
    parameterName: 'Zero-Strength Baseline (α = 0)',
    simpleExplanation:
      'Control setting that leaves your sentence vector 100% unchanged so shifts can be measured honestly.',
    technicalExplanation:
      'When strength == 0.0, SteeringService returns an exact copy of normalized E (preservation = 1.0, neighbor_stability = 1.0, displacement = 0.0).',
    formulaOrExample: "α = 0  ⇒  E' = E,   cos(E, E') = 1.0",
    copyableFormula: "alpha == 0.0 => E' == E",
    whereUsed: ['Semantic Explorer', 'Vector Steering', 'Comparison Lab', 'Evaluation Dashboard'],
  },
  {
    id: 'steer-displacement',
    category: 'steering',
    parameterName: 'Vector Displacement (Δ)',
    simpleExplanation:
      'The straight-line movement and angle between the original and steered embeddings in 384D space.',
    technicalExplanation:
      'Computes Δ = E′ − E, euclidean_distance_384d = ||E′ − E||₂, angle_degrees = degrees(acos(cos(E, E′))), plus projected UMAP dx, dy, dz.',
    formulaOrExample: "Δ = E' − E,   ||Δ||₂ = ||E' − E||₂,   θ = arccos(cos(E, E'))",
    copyableFormula: "delta = E' - E; dist_384d = norm(delta)",
    whereUsed: ['Vector Steering', 'Comparison Lab', 'Evaluation Dashboard'],
  },
  {
    id: 'steer-alignment',
    category: 'steering',
    parameterName: 'Directional Alignment',
    simpleExplanation:
      'Checks whether physical vector movement Δ = E′ − E actually pointed along the intended +D or −D direction.',
    technicalExplanation:
      'Computes cos(E′ − E, sign(α) · D) across nonzero strength steps in EvaluationService._build_displacement_alignment; flags α = 0.0 zero displacement explicitly.',
    formulaOrExample: "align(α) = cos(E' − E, sign(α) · D)   for α ≠ 0",
    copyableFormula: "alignment = cosine_similarity(E' - E, sign(alpha) * D)",
    whereUsed: ['Evaluation Dashboard'],
  },

  // D. UMAP Parameters
  {
    id: 'umap-components',
    category: 'umap',
    parameterName: 'UMAP Number of Components (n_components = 3)',
    simpleExplanation:
      'Reduces 384 semantic dimensions down into 3 plot coordinates (x, y, z) so points can be visualized.',
    technicalExplanation:
      'Configured via Settings.umap_dimensions = 3; fits one 3-component UMAP reducer stored in backend/artifacts/umap_model.joblib.',
    formulaOrExample: 'UMAP(n_components=3):  ℝ³⁸⁴ → ℝ³',
    copyableFormula: 'n_components = 3',
    whereUsed: ['Overview', 'Semantic Explorer', 'Vector Steering', 'Evaluation Dashboard'],
  },
  {
    id: 'umap-neighbors',
    category: 'umap',
    parameterName: 'UMAP Number of Neighbors (n_neighbors = 15)',
    simpleExplanation:
      'Balances fine local detail against broader cluster structure when constructing the map.',
    technicalExplanation:
      'Settings.umap_n_neighbors = 15 (clamped safely to min(15, n_samples - 1) during fitting) defines local neighborhood graph size in 384D.',
    formulaOrExample: 'n_neighbors = 15',
    copyableFormula: 'n_neighbors = 15',
    whereUsed: ['Overview', 'Evaluation Dashboard'],
  },
  {
    id: 'umap-min-dist',
    category: 'umap',
    parameterName: 'UMAP Minimum Distance (min_dist = 0.1)',
    simpleExplanation:
      'Controls how tightly nearby sentence dots are allowed to pack together on the scatter map.',
    technicalExplanation:
      'Settings.umap_min_dist = 0.1 passed to umap.UMAP(...) to separate dense semantic neighborhoods visually.',
    formulaOrExample: 'min_dist = 0.1',
    copyableFormula: 'min_dist = 0.1',
    whereUsed: ['Overview'],
  },
  {
    id: 'umap-metric',
    category: 'umap',
    parameterName: 'UMAP Distance Metric (metric = "cosine")',
    simpleExplanation:
      'Tells UMAP to build its high-dimensional neighborhood graph using angles between sentence vectors.',
    technicalExplanation:
      'Settings.umap_metric = "cosine" matches normalized MiniLM similarity and is reused by sklearn_trustworthiness and continuity evaluations.',
    formulaOrExample: 'metric = "cosine"',
    copyableFormula: 'metric = "cosine"',
    whereUsed: ['Overview', 'Semantic Explorer', 'Evaluation Dashboard'],
  },
  {
    id: 'umap-seed',
    category: 'umap',
    parameterName: 'UMAP Random State (random_state = 42)',
    simpleExplanation:
      'Fixed seed so the semantic map does not scramble into a completely different shape on every restart.',
    technicalExplanation:
      'Settings.umap_random_state = 42 with n_jobs = 1 produces a reproducible fitted UMAP artifact verified via manifest.json.',
    formulaOrExample: 'random_state = 42,   n_jobs = 1',
    copyableFormula: 'random_state = 42',
    whereUsed: ['Overview', 'Evaluation Dashboard'],
  },
  {
    id: 'umap-fitted',
    category: 'umap',
    parameterName: 'Fitted UMAP Model',
    simpleExplanation:
      'The saved map model built once from all 360 reference sentences so every query projects into one consistent coordinate frame.',
    technicalExplanation:
      'Serialized at backend/artifacts/umap_model.joblib alongside corpus_coords_3d.npy; never refitted during queries or stability evaluation.',
    formulaOrExample: 'umap_model.joblib fitted once on 360 × 384D corpus',
    whereUsed: ['Semantic Explorer', 'Vector Steering', 'Comparison Lab', 'Evaluation Dashboard'],
  },
  {
    id: 'umap-transform',
    category: 'umap',
    parameterName: 'UMAP Transform Operation',
    simpleExplanation:
      'Places new custom or steered sentences onto the existing frozen map without moving corpus landmarks.',
    technicalExplanation:
      'Calls _umap_model.transform(...) guarded by threading.Lock via SemanticMapService.transform_vector / transform_batch.',
    formulaOrExample: 'coords_3d = umap_model.transform(vector_384D)',
    copyableFormula: 'coords = umap_model.transform(embeddings)',
    whereUsed: ['Semantic Explorer', 'Vector Steering', 'Comparison Lab', 'Evaluation Dashboard'],
  },
  {
    id: 'umap-2d-proj',
    category: 'umap',
    parameterName: '2D Projection',
    simpleExplanation:
      'A flat top-down view showing the first two coordinates (x, y) of the 3D UMAP map.',
    technicalExplanation:
      'VectiQ renders 2D charts in SemanticSpacePlot using coords_3d[:, :2] (the (x, y) slice of the fitted 3D UMAP coordinates, rather than fitting a separate 2D UMAP reducer).',
    formulaOrExample: 'proj_2D(x, y, z) = (x, y)',
    copyableFormula: 'coords_2d = coords_3d[:, :2]',
    whereUsed: ['Semantic Explorer', 'Vector Steering', 'Comparison Lab', 'Evaluation Dashboard'],
  },
  {
    id: 'umap-3d-proj',
    category: 'umap',
    parameterName: '3D Projection',
    simpleExplanation:
      'Interactive 3-axis coordinate map (x, y, z) that lets you orbit around semantic clusters.',
    technicalExplanation:
      'Full 3-component fitted UMAP coordinates returned as Coordinate3D(x, y, z) across /semantic-map, /steer, and /evaluate.',
    formulaOrExample: 'proj_3D(E) = (x, y, z) ∈ ℝ³',
    whereUsed: ['Semantic Explorer', 'Vector Steering', 'Comparison Lab', 'Evaluation Dashboard'],
  },

  // E. Evaluation Parameters
  {
    id: 'eval-trustworthiness',
    category: 'evaluation',
    parameterName: 'Trustworthiness (T(k))',
    simpleExplanation:
      'Checks whether dots that appear close together on the UMAP map were genuinely close in 384D space (penalizes false neighbors).',
    technicalExplanation:
      'Computed on 3D fitted UMAP using sklearn.manifold.trustworthiness(corpus_embeddings, coords_3d, n_neighbors=k, metric="cosine") with k = min(15, (n-1)//2) = 15 over all 360 corpus items.',
    formulaOrExample: 'T(k) = 1 − [2 / (N k (2N − 3k − 1))] ∑∑ (r_high(i,j) − k)',
    copyableFormula: 'T(k) = 1 - (2 / (N * k * (2*N - 3*k - 1))) * sum(rank_high(i, j) - k)',
    whereUsed: ['Evaluation Dashboard'],
  },
  {
    id: 'eval-continuity',
    category: 'evaluation',
    parameterName: 'Continuity (C(k), 2D & 3D)',
    simpleExplanation:
      'Checks the converse of trustworthiness: whether true 384D neighbors stayed close together instead of being torn apart on the map.',
    technicalExplanation:
      'Venna & Kaski continuity computed separately for 2D (x, y) slice and 3D UMAP in manifold_metrics.compute_continuity_and_overlap using configurable continuity_k (default k = 15).',
    formulaOrExample: 'C(k) = 1 − [2 / (N k (2N − 3k − 1))] ∑_{j ∈ N_k(384D)\\N_k(proj)} (r_proj(i,j) − k)',
    copyableFormula: 'C(k) = 1 - (2 / (N * k * (2*N - 3*k - 1))) * sum(rank_proj(i, j) - k)',
    whereUsed: ['Evaluation Dashboard'],
  },
  {
    id: 'eval-neighbor-preservation',
    category: 'evaluation',
    parameterName: 'Neighborhood Preservation (384D Stability)',
    simpleExplanation:
      'Shows what fraction of a sentence’s closest reference sentences stay nearby as steering strength varies.',
    technicalExplanation:
      'Mean and minimum Jaccard overlap |N_k(E) ∩ N_k(E′)| / |N_k(E) ∪ N_k(E′)| evaluated strictly in 384D cosine space across sweep strengths relative to α = 0.',
    formulaOrExample: "Jaccard_k(λ) = |N_k(E) ∩ N_k(E')| / |N_k(E) ∪ N_k(E')|",
    copyableFormula: 'mean_neighbor_stability = mean(|N_k(E) & N_k(E_step)| / |N_k(E) | N_k(E_step)|)',
    whereUsed: ['Evaluation Dashboard', 'Comparison Lab'],
  },
  {
    id: 'eval-2d-3d-overlap',
    category: 'evaluation',
    parameterName: '2D vs. 3D Neighborhood Overlap',
    simpleExplanation:
      'Compares the top-K nearest neighbors shown in the 2D plot directly against the top-K nearest neighbors in the 3D plot.',
    technicalExplanation:
      'Measures Euclidean k-NN overlap rate |N_k^2D(i) ∩ N_k^3D(i)| / k and Jaccard between 2D (x, y) and 3D (x, y, z) projections (kept strictly distinct from projected-vs-384D recall).',
    formulaOrExample: 'Overlap_2D_3D(k) = (1/N) ∑ |N_k^{2D}(i) ∩ N_k^{3D}(i)| / k',
    copyableFormula: 'overlap_2d_3d = mean(|N_k_2d & N_k_3d| / k)',
    whereUsed: ['Evaluation Dashboard'],
  },
  {
    id: 'eval-distortion',
    category: 'evaluation',
    parameterName: 'Projection Distortion (2D & 3D)',
    simpleExplanation:
      'Measures how well large-scale distances on the map track true 384D pairwise distance rankings and proportions.',
    technicalExplanation:
      'Computes Spearman rank correlation, Pearson r, and optimal-scale Kruskal Stress-1 over all N(N−1)/2 upper-triangle pairs (64,620 pairs for N=360; seeded subsample of 500 if N > 500).',
    formulaOrExample: 'Stress-1 = sqrt( ∑(d_384 − s·d_proj)² / ∑ d_384² ),   s = (d_384·d_proj)/(d_proj·d_proj)',
    copyableFormula: 'stress_1 = sqrt(sum((d_high - s * d_low) ** 2) / sum(d_high ** 2))',
    whereUsed: ['Evaluation Dashboard'],
  },
  {
    id: 'eval-transform-stability',
    category: 'evaluation',
    parameterName: 'UMAP Transform Stability',
    simpleExplanation:
      'Checks whether transforming identical embeddings repeatedly, in reversed order, or individually vs. batched changes plotted coordinates.',
    technicalExplanation:
      'Evaluates frozen umap_model.transform across repeated batches (2 runs), reversed order, and single-vs-batch comparisons at tolerance 1e-5 without refitting UMAP; reports batch-coupling drift honestly as "partial".',
    formulaOrExample: 'max ||coord_batch(E_i) − coord_alt(E_i)||₂ ≤ 1e-5',
    whereUsed: ['Evaluation Dashboard'],
  },
  {
    id: 'eval-unit-norm',
    category: 'evaluation',
    parameterName: 'Unit-Norm Validation',
    simpleExplanation:
      'Audits raw original and steered vectors to confirm their lengths stay near 1.0 with no corrupted NaN, Inf, zero, or wrong-sized vectors.',
    technicalExplanation:
      'validate_unit_norm_vectors inspects raw vectors without silent re-normalization against |‖E‖₂ − 1| ≤ 1e-4 and explicitly counts NaN, Inf, zero-norm (≤ 1e-12), and non-384D arrays.',
    formulaOrExample: '| √(∑ E_i²) − 1 | ≤ 10⁻⁴   and finite(E)',
    copyableFormula: 'abs(sqrt(sum(E_i^2)) - 1.0) <= 1e-4',
    whereUsed: ['Evaluation Dashboard'],
  },
  {
    id: 'eval-sem-preservation',
    category: 'evaluation',
    parameterName: 'Semantic Preservation & Drift',
    simpleExplanation:
      'Shows how much original 384D angular similarity remains after steering across positive and negative strengths.',
    technicalExplanation:
      'Reports mean cos(E, E′), min cos(E, E′), and preservation_decay_rate = max(0, 1 − min_preservation) across evaluated sweep steps.',
    formulaOrExample: "preservation = cos(E, E'),   decay = 1 − min(cos(E, E'))",
    copyableFormula: "decay = max(0.0, 1.0 - min_preservation)",
    whereUsed: ['Vector Steering', 'Comparison Lab', 'Evaluation Dashboard'],
  },
  {
    id: 'eval-monotonicity',
    category: 'evaluation',
    parameterName: 'Monotonicity (Spearman ρ & R²)',
    simpleExplanation:
      'Checks whether dialing steering strength higher smoothly raises target concept alignment rather than reversing unpredictably.',
    technicalExplanation:
      'Verifies step_scores[i+1] ≥ step_scores[i] − 1e-6 alongside scipy.stats.spearmanr ρ, Pearson r, linearity R² = r², and interval directional consistency.',
    formulaOrExample: 'score(λ_{i+1}) ≥ score(λ_i) − 10⁻⁶,   ρ = spearmanr(λ, scores)',
    copyableFormula: 'spearman_rho = spearmanr(strengths, concept_scores).statistic',
    whereUsed: ['Evaluation Dashboard'],
  },
  {
    id: 'eval-repeatability',
    category: 'evaluation',
    parameterName: 'Steering Repeatability',
    simpleExplanation:
      'Verifies that repeating the same steering run multiple times produces identical vectors and movements.',
    technicalExplanation:
      'Re-executes SteeringService.steer_embedding independently 3 times per strength step in _build_steering_repeatability and checks L2 diff ≤ 1e-6 and min vector cosine.',
    formulaOrExample: "runs = 3;  max ||E'^(r) − E'^(1)||₂ ≤ 10⁻⁶",
    whereUsed: ['Evaluation Dashboard'],
  },
  {
    id: 'eval-sample-size',
    category: 'evaluation',
    parameterName: 'Sample Size',
    simpleExplanation:
      'Exact number of sentences, vectors, pairs, or runs measured for each dashboard card.',
    technicalExplanation:
      'Tracked per metric: 360 corpus sentences (64,620 pairs) for corpus UMAP metrics, len(strengths) sweep steps, 1 + len(strengths) for norm audit, and 3 × len(strengths) runs for repeatability.',
    formulaOrExample: 'pairs = N(N − 1)/2 = 360 × 359 / 2 = 64,620',
    whereUsed: ['Evaluation Dashboard'],
  },
  {
    id: 'eval-tolerance',
    category: 'evaluation',
    parameterName: 'Evaluation Tolerance',
    simpleExplanation:
      'Small numeric safety margin used when testing equality in floating-point checks.',
    technicalExplanation:
      'Explicit constants in backend code: MONOTONIC_EPSILON = 1e-6, steering repeatability tol = 1e-6, UMAP transform stability tol = 1e-5, unit-norm tol = 1e-4, zero-norm NORM_EPSILON = 1e-12.',
    formulaOrExample: 'norm tol = 1e-4 | UMAP tol = 1e-5 | monotonic/repeat = 1e-6',
    whereUsed: ['Evaluation Dashboard'],
  },

  // F. Sentiment and Emotion Parameters
  {
    id: 'aff-sentiment-polarity',
    category: 'affect',
    parameterName: 'Sentiment Polarity',
    simpleExplanation:
      'Classifies whether the original sentence sounds Positive, Neutral, or Negative.',
    technicalExplanation:
      'Genuine softmax inference using cardiffnlp/twitter-roberta-base-sentiment-latest via AffectAnalysisService (normalized so Positive + Neutral + Negative = 1.0). Evaluates original text independently of vector steering.',
    formulaOrExample: 'P(sentiment | text) = softmax(RoBERTa_logits)',
    whereUsed: ['Semantic Explorer', 'Vector Steering'],
  },
  {
    id: 'aff-positive-sentiment',
    category: 'affect',
    parameterName: 'Positive Sentiment Probability',
    simpleExplanation:
      'Classifier probability that the original sentence expresses upbeat or favorable sentiment.',
    technicalExplanation:
      'Normalized softmax probability for class "positive" from twitter-roberta-base-sentiment-latest (kept strictly separate from the 384D positive_sentiment steering axis).',
    formulaOrExample: 'probabilities.positive ∈ [0.0, 1.0]',
    whereUsed: ['Semantic Explorer', 'Vector Steering'],
  },
  {
    id: 'aff-negative-sentiment',
    category: 'affect',
    parameterName: 'Negative Sentiment Probability',
    simpleExplanation:
      'Classifier probability that the original sentence expresses unfavorable, critical, or sad sentiment.',
    technicalExplanation:
      'Normalized softmax probability for class "negative" from twitter-roberta-base-sentiment-latest.',
    formulaOrExample: 'probabilities.negative ∈ [0.0, 1.0]',
    whereUsed: ['Semantic Explorer', 'Vector Steering'],
  },
  {
    id: 'aff-neutral-sentiment',
    category: 'affect',
    parameterName: 'Neutral Sentiment Probability',
    simpleExplanation:
      'Classifier probability that the original sentence is factual or emotionally balanced.',
    technicalExplanation:
      'Normalized softmax probability for class "neutral" from twitter-roberta-base-sentiment-latest.',
    formulaOrExample: 'probabilities.neutral ∈ [0.0, 1.0]',
    whereUsed: ['Semantic Explorer', 'Vector Steering'],
  },
  {
    id: 'aff-emotion-class',
    category: 'affect',
    parameterName: 'Emotion Classification (GoEmotions)',
    simpleExplanation:
      'Detects specific emotions like Joy, Sadness, Anger, Fear, Surprise, Disgust, Love, or Neutral.',
    technicalExplanation:
      'SamLowe/roberta-base-go_emotions predicts 28 raw multi-label sigmoid scores mapped onto core categories (joy [unifying joy & happiness], sadness, anger, fear, surprise, disgust, love, neutral) plus "other" (with raw_top_label preserved) and "uncertain".',
    formulaOrExample: 'Categories: joy, sadness, anger, fear, surprise, disgust, love, neutral, other, uncertain',
    whereUsed: ['Semantic Explorer', 'Vector Steering'],
  },
  {
    id: 'aff-emotion-prob',
    category: 'affect',
    parameterName: 'Emotion Probability',
    simpleExplanation:
      'Individual percentage score showing how strongly the emotion model detected each supported emotion.',
    technicalExplanation:
      'Independent per-class sigmoid probability round(sigmoid(logit_c), 6) returned in descending rank for all 28 GoEmotions labels.',
    formulaOrExample: 'p(emotion_c) = σ(logit_c) ∈ [0.0, 1.0]',
    copyableFormula: 'p_c = 1 / (1 + exp(-logit_c))',
    whereUsed: ['Semantic Explorer', 'Vector Steering'],
  },
  {
    id: 'aff-confidence',
    category: 'affect',
    parameterName: 'Prediction Confidence & Margin',
    simpleExplanation:
      'How sure the classifier was about its top choice and how far ahead it beat the runner-up.',
    technicalExplanation:
      'confidence = top probability p₁; margin = max(0, p₁ − p₂) computed for both sentiment and emotion classifiers.',
    formulaOrExample: 'confidence = p₁,   margin = p₁ − p₂',
    copyableFormula: 'margin = max(0.0, p1 - p2)',
    whereUsed: ['Semantic Explorer', 'Vector Steering'],
  },
  {
    id: 'aff-uncertainty',
    category: 'affect',
    parameterName: 'Uncertainty Threshold',
    simpleExplanation:
      'Flags borderline or ambiguous sentences as "Uncertain" instead of forcing a brittle overconfident guess.',
    technicalExplanation:
      'Configured in Settings & AffectAnalysisService: Sentiment flagged uncertain if max_prob < 0.60 OR margin < 0.15; Emotion flagged uncertain if top_prob < 0.45 OR (top_prob < 0.65 AND margin < 0.10).',
    formulaOrExample: 'Sentiment: p₁ < 0.60 ∨ margin < 0.15  |  Emotion: p₁ < 0.45 ∨ (p₁ < 0.65 ∧ margin < 0.10)',
    copyableFormula: 'is_uncertain = (top_p < 0.45) or (top_p < 0.65 and margin < 0.10)',
    whereUsed: ['Semantic Explorer', 'Vector Steering'],
  },
  {
    id: 'aff-human-label',
    category: 'affect',
    parameterName: 'Human-Confirmed Label',
    simpleExplanation:
      'An optional reviewer correction or confirmation stored alongside the AI prediction without altering the AI record.',
    technicalExplanation:
      'human_emotion_label + review_status (confirmed, corrected, flagged_uncertain) + audit history persisted in SQLite backend/artifacts/emotion_reviews.db via POST /api/v1/emotions/reviews.',
    formulaOrExample: 'actions ∈ {confirm, correct, flag_uncertain}',
    whereUsed: ['Semantic Explorer', 'Vector Steering'],
  },
  {
    id: 'aff-original-pred',
    category: 'affect',
    parameterName: 'Original Model Prediction (Immutable)',
    simpleExplanation:
      'The unmodified classifier output saved permanently so human corrections can always be audited against model accuracy.',
    technicalExplanation:
      'Stored frozen inside emotion_records (original_sentiment_json, original_emotion_json, coord_x/y/z) and returned alongside human overlays without ever altering UMAP coordinates.',
    formulaOrExample: 'Immutable record preserved on every review update',
    whereUsed: ['Semantic Explorer', 'Vector Steering'],
  },
];

export function filterGlossaryEntries(
  entries: GlossaryEntry[],
  query: string,
  category: GlossaryCategoryId | 'all'
): GlossaryEntry[] {
  const cleanQuery = query.trim().toLowerCase();
  return entries.filter((entry) => {
    if (category !== 'all' && entry.category !== category) return false;
    if (!cleanQuery) return true;
    return (
      entry.parameterName.toLowerCase().includes(cleanQuery) ||
      entry.simpleExplanation.toLowerCase().includes(cleanQuery) ||
      entry.technicalExplanation.toLowerCase().includes(cleanQuery) ||
      entry.formulaOrExample.toLowerCase().includes(cleanQuery) ||
      entry.whereUsed.some((w) => w.toLowerCase().includes(cleanQuery))
    );
  });
}
