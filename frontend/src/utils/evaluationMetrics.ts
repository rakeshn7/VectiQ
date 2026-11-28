import type { EvaluateResponse, MetricStatus } from '@/types/api';
import { formatNumber, formatPercent } from '@/utils/format';

export function isFiniteNum(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export interface MetricAuditSpec {
  id: string;
  title: string;
  plainSummary: string;
  actualDisplay: string;
  statusBadge?: {
    label: string;
    variant: 'emerald' | 'amber' | 'neutral' | 'cyan' | 'violet' | 'rose';
  };
  unavailable?: boolean;
  paramsDisplay?: string;
  definition: string;
  measures: string;
  doesNotMeasure: string;
  calculationMethod: string;
  actualRaw: string;
  sampleSize: string;
  limitations: string;
}

export interface EvaluationDashboardContextMeta {
  sortedStepCount: number;
  topK: number;
  corpusTotalPoints?: number | null;
  baselinePreservation?: number | null;
  baselineNeighborStability?: number | null;
  hasMissingStepCoords?: boolean;
}

function statusToBadge(
  status: MetricStatus,
  fallbackLabel?: string
): { label: string; variant: 'emerald' | 'amber' | 'neutral' | 'cyan' | 'violet' | 'rose' } {
  if (status === 'passed') return { label: fallbackLabel ?? 'Passed', variant: 'emerald' };
  if (status === 'computed') return { label: fallbackLabel ?? 'Computed', variant: 'cyan' };
  if (status === 'partial') return { label: fallbackLabel ?? 'Partial', variant: 'amber' };
  if (status === 'failed') return { label: fallbackLabel ?? 'Failed', variant: 'rose' };
  return { label: fallbackLabel ?? 'Unavailable', variant: 'amber' };
}

export function buildGoal1Metrics(
  result: EvaluateResponse,
  meta: EvaluationDashboardContextMeta
): MetricAuditSpec[] {
  const {
    monotonicity,
    linearity_score,
    vector_displacement_alignment: align,
    steering_repeatability: repeat,
  } = result.metrics_summary;

  const stepSampleLabel = `${meta.sortedStepCount} strength steps`;
  const rho = monotonicity.spearman_correlation;
  const pearsonR = monotonicity.pearson_correlation;
  const dirCons = monotonicity.directional_consistency;

  const cards: MetricAuditSpec[] = [
    {
      id: 'spearman-monotonicity',
      title: 'Steering Monotonicity (Spearman ρ)',
      plainSummary:
        'Checks whether increasing the steering slider consistently raises the target concept alignment score.',
      actualDisplay: isFiniteNum(rho) ? `ρ = ${formatNumber(rho, 4)}` : 'Unavailable',
      unavailable: !isFiniteNum(rho),
      statusBadge: !isFiniteNum(rho)
        ? { label: 'Unavailable', variant: 'amber' }
        : monotonicity.is_monotonic
        ? { label: 'Strictly Monotonic', variant: 'emerald' }
        : { label: 'Non-Monotonic', variant: 'amber' },
      paramsDisplay: `steps=${meta.sortedStepCount}, tolerance=1e-6`,
      definition:
        'Rank correlation between ordered steering strengths λ and resulting target concept scores cos(v′, c).',
      measures:
        'Ordinal predictability: whether stepping λ upward never decreases concept alignment.',
      doesNotMeasure:
        'Linguistic tone change in rewritten English text or semantic plausibility of out-of-distribution inputs.',
      calculationMethod:
        'scipy.stats.spearmanr(strengths, step_concept_scores) over sorted λ ∈ [-1.0, +1.0] (backend EvaluationService)',
      actualRaw: isFiniteNum(rho)
        ? `ρ = ${formatNumber(rho, 6)}, is_monotonic = ${String(monotonicity.is_monotonic)}`
        : 'null / non-finite (insufficient score variance or constant strengths)',
      sampleSize: stepSampleLabel,
      limitations:
        'Because E′ = normalize(E + α·D) adds α·D directly, high ρ also holds for non-prose or out-of-domain inputs; interpret alongside displacement alignment and preservation.',
    },
    {
      id: 'concept-linearity',
      title: 'Linear Response Fit (R² & Pearson r)',
      plainSummary:
        'Measures how closely concept alignment grows linearly across steering strengths.',
      actualDisplay: isFiniteNum(linearity_score)
        ? `R² = ${formatNumber(linearity_score, 4)}`
        : 'Unavailable',
      unavailable: !isFiniteNum(linearity_score),
      statusBadge: isFiniteNum(linearity_score)
        ? { label: 'Computed', variant: 'cyan' }
        : { label: 'Unavailable', variant: 'amber' },
      paramsDisplay: `r=${isFiniteNum(pearsonR) ? formatNumber(pearsonR, 4) : 'null'}, steps=${meta.sortedStepCount}`,
      definition:
        'Coefficient of determination (r²) between steering strength λ and concept alignment score.',
      measures:
        'Proportion of concept-score variance explained linearly by steering multiplier λ.',
      doesNotMeasure:
        'Effect size amplitude or absence of cross-concept spillover.',
      calculationMethod:
        'R² = (scipy.stats.pearsonr(strengths, step_concept_scores).statistic)² on backend',
      actualRaw: isFiniteNum(linearity_score)
        ? `R² = ${formatNumber(linearity_score, 6)}, Pearson r = ${formatNumber(pearsonR, 4)}`
        : 'null / non-finite returned by backend',
      sampleSize: stepSampleLabel,
      limitations:
        'Unit-sphere saturation slightly curves high-magnitude ends (|λ| near 1.0).',
    },
    {
      id: 'score-progression-consistency',
      title: 'Stepwise Score Progression',
      plainSummary:
        'Share of adjacent slider intervals where increasing strength produced a non-decreasing concept score.',
      actualDisplay: isFiniteNum(dirCons) ? formatPercent(dirCons, 1) : 'Unavailable',
      unavailable: !isFiniteNum(dirCons),
      statusBadge: isFiniteNum(dirCons)
        ? { label: 'Computed', variant: dirCons >= 0.999 ? 'emerald' : 'amber' }
        : { label: 'Unavailable', variant: 'amber' },
      paramsDisplay: `intervals=${Math.max(0, meta.sortedStepCount - 1)}, eps=1e-6`,
      definition:
        'Fraction of consecutive strength intervals Δλ > 1e-6 satisfying Δ(concept_score) >= -1e-6.',
      measures: 'Local interval smoothness along the scalar projection score curve.',
      doesNotMeasure: 'Physical 384D displacement vector direction (reported separately below).',
      calculationMethod:
        'count(score[i+1] - score[i] >= -1e-6) / len(intervals) in backend EvaluationService',
      actualRaw: isFiniteNum(dirCons)
        ? `${formatPercent(dirCons, 2)} (${formatNumber(dirCons, 4)})`
        : 'null / unavailable (degenerate or duplicate strength steps)',
      sampleSize: `${Math.max(0, meta.sortedStepCount - 1)} adjacent intervals (${meta.sortedStepCount} steps)`,
      limitations: 'Checks scalar concept score deltas across the configured grid only.',
    },
  ];

  // Vector Displacement Alignment (real backend telemetry)
  if (!align) {
    cards.push({
      id: 'vector-displacement-alignment',
      title: 'Vector Displacement Alignment (384D)',
      plainSummary:
        'Checks whether physical embedding movement Δ = E′ − E points toward +D (positive λ) and −D (negative λ).',
      actualDisplay: 'Unavailable in Response',
      unavailable: true,
      statusBadge: { label: 'Missing Field', variant: 'amber' },
      definition: 'cos(E′ − E, sign(λ)·D) across nonzero steering steps.',
      measures: 'Directional fidelity of physical movement in 384D space.',
      doesNotMeasure: 'N/A — missing field.',
      calculationMethod: 'POST /api/v1/evaluate vector_displacement_alignment',
      actualRaw: 'vector_displacement_alignment absent from backend payload',
      sampleSize: '0',
      limitations: 'Requires vector_displacement_alignment in backend /evaluate response.',
    });
  } else {
    const isAvail = align.status !== 'unavailable' && isFiniteNum(align.value);
    cards.push({
      id: 'vector-displacement-alignment',
      title: 'Vector Displacement Alignment (384D)',
      plainSummary:
        'Measures cosine alignment between actual 384D vector movement Δ = E′ − E and intended direction ±D.',
      actualDisplay: isAvail ? `cos = ${formatNumber(align.value, 4)}` : 'Unavailable',
      unavailable: !isAvail,
      statusBadge: statusToBadge(align.status, isAvail ? 'Aligned' : 'Unavailable'),
      paramsDisplay: `concept=${align.concept}, pos=${isFiniteNum(align.positive_mean_alignment) ? formatNumber(align.positive_mean_alignment, 3) : '—'}, neg=${isFiniteNum(align.negative_mean_alignment) ? formatNumber(align.negative_mean_alignment, 3) : '—'}`,
      definition:
        'Cosine similarity cos(E′ − E, sign(λ)·D) computed directly in 384D; λ = 0.0 zero displacement is handled separately.',
      measures:
        'Physical trajectory direction for both positive (+D) and negative (−D) steering strengths.',
      doesNotMeasure:
        'Magnitude preservation or linguistic fluency of hypothetical rewritten prose.',
      calculationMethod: align.methodology,
      actualRaw: isAvail
        ? `mean=${formatNumber(align.value, 6)}, pos_mean=${formatNumber(align.positive_mean_alignment, 4)}, neg_mean=${formatNumber(align.negative_mean_alignment, 4)}, zero_handled=${String(align.zero_strength_handled)}, orig_id=${align.original_vector_id}`
        : align.unavailable_reason ?? 'Unavailable',
      sampleSize: `${align.sample_size} nonzero steps (${align.step_alignments.length} total, orig ${align.original_vector_id})`,
      limitations: align.limitations,
    });
  }

  // Steering Repeatability (real backend telemetry)
  if (!repeat) {
    cards.push({
      id: 'steering-repeatability',
      title: 'Steering Repeatability',
      plainSummary:
        'Verifies repeated identical steering executions produce identical vectors and displacements.',
      actualDisplay: 'Unavailable in Response',
      unavailable: true,
      statusBadge: { label: 'Missing Field', variant: 'amber' },
      definition: 'Multi-run vector and displacement consistency across identical steering inputs.',
      measures: 'Deterministic repeatability of backend steering arithmetic.',
      doesNotMeasure: 'N/A — missing field.',
      calculationMethod: 'POST /api/v1/evaluate steering_repeatability',
      actualRaw: 'steering_repeatability absent from backend payload',
      sampleSize: '0',
      limitations: 'Requires steering_repeatability in backend /evaluate response.',
    });
  } else {
    const isAvail = repeat.status !== 'unavailable' && isFiniteNum(repeat.min_vector_cosine);
    cards.push({
      id: 'steering-repeatability',
      title: 'Steering Repeatability',
      plainSummary:
        'Runs the same steering operation repeatedly across strengths to check output & displacement consistency.',
      actualDisplay: isAvail
        ? `Min cos = ${formatNumber(repeat.min_vector_cosine, 4)}`
        : 'Unavailable',
      unavailable: !isAvail,
      statusBadge: statusToBadge(
        repeat.status,
        repeat.status === 'passed' ? 'Consistent' : repeat.status === 'failed' ? 'Drift' : undefined
      ),
      paramsDisplay: `runs=${repeat.runs}, max_diff=${isFiniteNum(repeat.max_vector_diff) ? repeat.max_vector_diff.toExponential(1) : '—'}`,
      definition:
        'Maximum L2 difference and minimum cosine similarity across repeated independent executions of SteeringService.steer_embedding.',
      measures:
        'Reproducibility of both steered embeddings and displacement vectors under identical inputs.',
      doesNotMeasure: 'Upstream MiniLM encoder noise across different software/GPU kernels.',
      calculationMethod: repeat.methodology,
      actualRaw: isAvail
        ? `min_cos=${formatNumber(repeat.min_vector_cosine, 6)}, max_vec_diff=${repeat.max_vector_diff}, max_disp_diff=${repeat.max_displacement_diff}, consistent=${String(repeat.is_consistent)}`
        : repeat.unavailable_reason ?? 'Unavailable',
      sampleSize: `${repeat.sample_size} steering runs (${repeat.runs} runs × ${Math.round(repeat.sample_size / Math.max(1, repeat.runs))} strengths)`,
      limitations: repeat.limitations,
    });
  }

  return cards;
}

export function buildGoal2Metrics(
  result: EvaluateResponse,
  meta: EvaluationDashboardContextMeta
): MetricAuditSpec[] {
  const {
    preservation_retention,
    stability_summary,
    unit_norm_validation: normVal,
  } = result.metrics_summary;

  const stepSampleLabel = `${meta.sortedStepCount} strength steps`;
  const zeroPres = meta.baselinePreservation;
  const zeroStab = meta.baselineNeighborStability;
  const meanPres = preservation_retention.mean_preservation;
  const minPres = preservation_retention.min_preservation;
  const decay = preservation_retention.preservation_decay_rate;
  const meanStab = stability_summary.mean_neighbor_stability;
  const minStab = stability_summary.min_neighbor_stability;
  const retainedMax = stability_summary.retained_original_neighbors_at_max;

  const cards: MetricAuditSpec[] = [
    {
      id: 'zero-strength-identity',
      title: 'Zero-Strength Baseline Identity (λ = 0.0)',
      plainSummary:
        'Confirms that setting strength to 0.0 leaves your original embedding completely untouched.',
      actualDisplay: isFiniteNum(zeroPres) ? formatPercent(zeroPres, 2) : 'λ = 0.0 Not in Sweep',
      unavailable: !isFiniteNum(zeroPres),
      statusBadge: isFiniteNum(zeroPres)
        ? Math.abs(zeroPres - 1.0) < 1e-5
          ? { label: 'Exact Baseline', variant: 'emerald' }
          : { label: 'Drift Detected', variant: 'rose' }
        : { label: 'Missing λ=0', variant: 'amber' },
      paramsDisplay: `control_strength=0.0`,
      definition:
        'Cosine similarity cos(E, E′) and neighbor identity evaluated explicitly at control strength λ = 0.0.',
      measures: 'Zero-perturbation control integrity.',
      doesNotMeasure: 'Behavior at nonzero |λ| > 0 or encoding truncation above 256 tokens.',
      calculationMethod:
        'SteeringService.steer_embedding returns exact copy at λ = 0.0; checked directly at step 0.0.',
      actualRaw: isFiniteNum(zeroPres)
        ? `preservation = ${formatNumber(zeroPres, 6)}, neighbor_stability = ${formatNumber(zeroStab, 6)}`
        : 'λ = 0.0 step not included in evaluated strength list',
      sampleSize: isFiniteNum(zeroPres) ? '1 control step per sweep' : '0 control steps in sweep',
      limitations: 'Inputs exceeding 256 wordpiece tokens still truncate during initial encoding.',
    },
    {
      id: 'cosine-preservation-and-drift',
      title: 'Semantic Preservation & Drift (cos(E, E′))',
      plainSummary:
        'Shows how close steered embeddings stay to your original sentence embedding in 384D space.',
      actualDisplay: isFiniteNum(meanPres) ? `Mean ${formatPercent(meanPres, 1)}` : 'Unavailable',
      unavailable: !isFiniteNum(meanPres),
      statusBadge: isFiniteNum(minPres)
        ? { label: `Min ${formatPercent(minPres, 1)}`, variant: 'cyan' }
        : { label: 'Min Unavailable', variant: 'amber' },
      paramsDisplay: `decay=${formatNumber(decay, 4)}, steps=${meta.sortedStepCount}`,
      definition:
        'Average and minimum 384D cosine similarity cos(E, E′) across all sweep strengths, with max drift 1 − min(cos).',
      measures: 'Angular retention between unsteered and steered unit vectors in 384D.',
      doesNotMeasure: 'Full paraphrase equivalence or cross-attribute disentanglement.',
      calculationMethod:
        'mean(E · E′), min(E · E′), and decay_rate = max(0, 1 − min_preservation) computed on backend',
      actualRaw: `mean = ${formatNumber(meanPres, 4)}, min = ${formatNumber(minPres, 4)}, decay = ${formatNumber(decay, 4)}`,
      sampleSize: stepSampleLabel,
      limitations: 'Strong |λ| (≥0.75) intentionally trades 15–30% cosine similarity for concept shift.',
    },
    {
      id: 'neighbor-stability',
      title: '384D Neighborhood Preservation (Jaccard)',
      plainSummary:
        'Checks how many of your sentence’s nearest 384D reference sentences remain nearby after steering.',
      actualDisplay: isFiniteNum(meanStab) ? formatPercent(meanStab, 1) : 'Unavailable',
      unavailable: !isFiniteNum(meanStab),
      statusBadge: isFiniteNum(meanStab)
        ? { label: `Retained ${retainedMax}/${meta.topK} @max`, variant: 'cyan' }
        : { label: 'Unavailable', variant: 'amber' },
      paramsDisplay: `top_k=${meta.topK}, corpus=${meta.corpusTotalPoints ?? 'loaded'}`,
      definition:
        'Mean Jaccard index |N_k(E) ∩ N_k(E′)| / |N_k(E) ∪ N_k(E′)| over top-K corpus neighbors in 384D cosine space.',
      measures: 'Local corpus retrieval stability in 384D cosine space.',
      doesNotMeasure: '2D-vs-3D projected UMAP layout agreement (reported in Goal 3).',
      calculationMethod:
        'Jaccard overlap of exact vectorized 384D top-K neighbor IDs per step against λ = 0.0 baseline',
      actualRaw: `mean = ${formatNumber(meanStab, 4)}, min = ${formatNumber(minStab, 4)}, retained @max = ${retainedMax}/${meta.topK}`,
      sampleSize: `${meta.sortedStepCount} steps × top-${meta.topK} of ${meta.corpusTotalPoints ?? 'loaded'} corpus items`,
      limitations: 'Sensitivity depends on local corpus density and K; large |λ| shifts neighbors toward target pole.',
    },
  ];

  // Unit-Norm Validation (real backend telemetry)
  if (!normVal) {
    cards.push({
      id: 'unit-norm-validation',
      title: 'Unit-Norm Validation (||E||₂ & ||E′||₂)',
      plainSummary:
        'Validates raw L2 norms across original and steered 384D vectors and checks NaN/Inf/zero/dimension bounds.',
      actualDisplay: 'Unavailable in /evaluate',
      unavailable: true,
      statusBadge: { label: 'Missing Field', variant: 'amber' },
      definition: '||E||₂ = sqrt(sum(E_i²)) validated within tolerance without re-normalizing.',
      measures: 'Hypersphere unit-norm preservation and numerical health.',
      doesNotMeasure: 'N/A — missing backend field.',
      calculationMethod: 'POST /api/v1/evaluate unit_norm_validation',
      actualRaw: 'unit_norm_validation absent from backend payload',
      sampleSize: '0',
      limitations: 'Requires unit_norm_validation in backend /evaluate response.',
    });
  } else {
    const isAvail = normVal.status !== 'unavailable';
    cards.push({
      id: 'unit-norm-validation',
      title: 'Unit-Norm Validation (||E||₂ & ||E′||₂)',
      plainSummary:
        'Validates raw L2 norms across original and steered 384D vectors (detects drift, NaN, Inf, zero, wrong-dim).',
      actualDisplay: isAvail
        ? `${normVal.valid_count}/${normVal.total_tested} Valid`
        : 'Unavailable',
      unavailable: !isAvail,
      statusBadge: statusToBadge(
        normVal.status,
        normVal.status === 'passed'
          ? 'All Unit Norm'
          : normVal.status === 'failed'
          ? `${normVal.invalid_count} Invalid`
          : undefined
      ),
      paramsDisplay: `tol=${normVal.tolerance.toExponential(0)}, min=${formatNumber(normVal.min_norm, 6)}, max=${formatNumber(normVal.max_norm, 6)}`,
      definition:
        '||E||₂ = sqrt(sum(E_i²)) validated with |‖E‖₂ − 1| ≤ tolerance plus NaN/Inf/zero/dimension checks.',
      measures:
        'Raw norm integrity of original and steered 384D vectors without silent re-normalization.',
      doesNotMeasure: 'Semantic closeness or linguistic quality.',
      calculationMethod: normVal.methodology,
      actualRaw: `valid=${normVal.valid_count}/${normVal.total_tested}, orig_norm=${formatNumber(normVal.original_norm, 6)}, min_norm=${formatNumber(normVal.min_norm, 6)}, max_norm=${formatNumber(normVal.max_norm, 6)}, max_dev=${normVal.max_deviation}, nan=${normVal.nan_count}, inf=${normVal.inf_count}, zero=${normVal.zero_vector_count}, wrong_dim=${normVal.wrong_dim_count}`,
      sampleSize: `${normVal.total_tested} vectors (1 original + ${normVal.steered_norms.length} steered)`,
      limitations: normVal.limitations,
    });
  }

  return cards;
}

export function buildGoal3Metrics(
  result: EvaluateResponse,
  meta: EvaluationDashboardContextMeta
): MetricAuditSpec[] {
  const summary = result.metrics_summary;
  const trustDetail = summary.umap_trustworthiness_detail;
  const trust3d = trustDetail?.value ?? summary.umap_trustworthiness;
  const cont2d = summary.umap_continuity_2d;
  const cont3d = summary.umap_continuity_3d;
  const overlap23 = summary.neighborhood_overlap_2d_3d;
  const dist2d = summary.projection_distortion_2d;
  const dist3d = summary.projection_distortion_3d;
  const tStab = summary.transform_stability;

  const fallbackCorpusSample = meta.corpusTotalPoints
    ? `${meta.corpusTotalPoints} reference corpus sentences`
    : 'Corpus sample size unknown';

  const cards: MetricAuditSpec[] = [
    {
      id: 'umap-trustworthiness-3d',
      title: '3D UMAP Trustworthiness',
      plainSummary:
        'Checks whether points close together in 3D UMAP are genuinely close in 384D space (penalizes false neighbors).',
      actualDisplay: isFiniteNum(trust3d) ? formatNumber(trust3d, 4) : 'Unavailable',
      unavailable: !isFiniteNum(trust3d),
      statusBadge: trustDetail
        ? statusToBadge(trustDetail.status, isFiniteNum(trust3d) ? '3D UMAP' : undefined)
        : isFiniteNum(trust3d)
        ? { label: '3D UMAP', variant: 'emerald' }
        : { label: 'Unavailable', variant: 'amber' },
      paramsDisplay: `k=${String(trustDetail?.parameters?.k ?? 15)}, metric=cosine`,
      definition:
        'Rank-penalized precision (0–1) measuring false intruders introduced in 3D UMAP vs. 384D cosine space.',
      measures: 'Precision of local projected neighbors in the fitted 3D UMAP layout.',
      doesNotMeasure: 'Continuity (dropped true 384D neighbors) or 2D slice fidelity.',
      calculationMethod:
        trustDetail?.methodology ??
        'sklearn.manifold.trustworthiness(embeddings_384d, coords_3d, n_neighbors=15, metric="cosine")',
      actualRaw: isFiniteNum(trust3d) ? `${formatNumber(trust3d, 6)}` : 'Unavailable',
      sampleSize: trustDetail
        ? `${trustDetail.sample_size} corpus points (k=${String(trustDetail.parameters?.k ?? 15)})`
        : fallbackCorpusSample,
      limitations:
        trustDetail?.limitations ??
        'High local trustworthiness does not guarantee global inter-cluster distances are metric.',
    },
  ];

  // Separate UMAP Continuity (2D & 3D)
  for (const [id, dimLabel, detail] of [
    ['umap-continuity-2d', 'UMAP Continuity (2D Slice)', cont2d] as const,
    ['umap-continuity-3d', 'UMAP Continuity (3D)', cont3d] as const,
  ]) {
    if (!detail) {
      cards.push({
        id,
        title: dimLabel,
        plainSummary: 'Measures whether true 384D neighbors remain close together in projected space.',
        actualDisplay: 'Unavailable in Response',
        unavailable: true,
        statusBadge: { label: 'Missing Field', variant: 'amber' },
        definition: 'Venna & Kaski continuity C(k) distinct from trustworthiness.',
        measures: 'True high-dimensional neighbor retention in low-dimensional projection.',
        doesNotMeasure: 'N/A — missing field.',
        calculationMethod: `POST /api/v1/evaluate ${id}`,
        actualRaw: 'Field missing from backend response',
        sampleSize: '0',
        limitations: 'Requires backend continuity field.',
      });
    } else {
      const ok = detail.status === 'computed' && isFiniteNum(detail.value);
      const kVal = String(detail.parameters?.k ?? 15);
      const recall = detail.parameters?.knn_recall_vs_384d;
      cards.push({
        id,
        title: dimLabel,
        plainSummary:
          dimLabel.includes('2D')
            ? 'Checks whether true 384D neighbors remain nearby in the 2D (x, y) UI projection.'
            : 'Checks whether true 384D neighbors remain nearby in the fitted 3D UMAP projection.',
        actualDisplay: ok ? formatNumber(detail.value, 4) : 'Unavailable',
        unavailable: !ok,
        statusBadge: statusToBadge(detail.status, ok ? `k=${kVal}` : undefined),
        paramsDisplay: `k=${kVal}, recall_vs_384d=${isFiniteNum(recall) ? formatPercent(recall, 1) : '—'}`,
        definition:
          'Dual of trustworthiness penalizing true 384D cosine k-nearest neighbors pushed outside k-NN in the projection.',
        measures: 'Neighborhood recall continuity (distinct from trustworthiness precision).',
        doesNotMeasure: 'False-neighbor intrusions (covered by Trustworthiness).',
        calculationMethod: detail.methodology,
        actualRaw: ok
          ? `continuity=${formatNumber(detail.value, 6)}, knn_recall_vs_384d=${formatNumber(recall as number, 4)}, knn_jaccard=${formatNumber(detail.parameters?.knn_jaccard_vs_384d as number, 4)}`
          : detail.unavailable_reason ?? 'Unavailable',
        sampleSize: `${detail.sample_size} corpus points (k=${kVal})`,
        limitations: detail.limitations,
      });
    }
  }

  // 2D vs 3D Visual Neighborhood Overlap
  if (!overlap23) {
    cards.push({
      id: 'neighborhood-overlap-2d-3d',
      title: '2D vs. 3D Visual Neighborhood Overlap',
      plainSummary: 'Compares top-k nearest neighbors in 2D (x, y) against top-k in 3D (x, y, z).',
      actualDisplay: 'Unavailable in Response',
      unavailable: true,
      statusBadge: { label: 'Missing Field', variant: 'amber' },
      definition: '|N_k^2D(i) ∩ N_k^3D(i)| / k across reference corpus points.',
      measures: 'Consistency between 2D and 3D projected neighbor neighborhoods.',
      doesNotMeasure: 'N/A — missing field.',
      calculationMethod: 'POST /api/v1/evaluate neighborhood_overlap_2d_3d',
      actualRaw: 'Field missing from backend response',
      sampleSize: '0',
      limitations: 'Requires neighborhood_overlap_2d_3d in backend response.',
    });
  } else {
    const ok = overlap23.status === 'computed' && isFiniteNum(overlap23.value);
    const kVal = String(overlap23.parameters?.k ?? meta.topK);
    cards.push({
      id: 'neighborhood-overlap-2d-3d',
      title: '2D vs. 3D Visual Neighborhood Overlap',
      plainSummary:
        'Compares projected 2D (x, y) neighbors directly against projected 3D (x, y, z) neighbors.',
      actualDisplay: ok ? formatPercent(overlap23.value, 1) : 'Unavailable',
      unavailable: !ok,
      statusBadge: statusToBadge(overlap23.status, ok ? `k=${kVal}` : undefined),
      paramsDisplay: `k=${kVal}, Jaccard=${isFiniteNum(overlap23.mean_jaccard) ? formatNumber(overlap23.mean_jaccard, 3) : '—'}, min=${isFiniteNum(overlap23.min_overlap) ? formatPercent(overlap23.min_overlap, 0) : '—'}`,
      definition:
        'Mean overlap |N_k(2D) ∩ N_k(3D)| / k and Jaccard between Euclidean k-NN sets in 2D and 3D UMAP views.',
      measures:
        'Agreement between the 2D and 3D projected plots (kept strictly distinct from 384D-vs-projected preservation).',
      doesNotMeasure:
        'Overlap with original 384D embeddings (reported separately as projected_vs_384d_overlap_2d/3d).',
      calculationMethod: overlap23.methodology,
      actualRaw: ok
        ? `2d_vs_3d=${formatPercent(overlap23.value, 2)}, jaccard=${formatNumber(overlap23.mean_jaccard, 4)}, range=[${formatNumber(overlap23.min_overlap, 2)}, ${formatNumber(overlap23.max_overlap, 2)}], distinct 384D_recall(2D=${formatNumber(overlap23.projected_vs_384d_overlap_2d, 3)}, 3D=${formatNumber(overlap23.projected_vs_384d_overlap_3d, 3)})`
        : overlap23.unavailable_reason ?? 'Unavailable',
      sampleSize: `${overlap23.sample_size} corpus points (k=${kVal})`,
      limitations: overlap23.limitations,
    });
  }

  // Projection Distortion (2D & 3D)
  for (const [id, title, detail] of [
    ['projection-distortion-2d', 'Projection Distortion (2D Slice)', dist2d] as const,
    ['projection-distortion-3d', 'Projection Distortion (3D UMAP)', dist3d] as const,
  ]) {
    if (!detail) {
      cards.push({
        id,
        title,
        plainSummary: 'Evaluates global distance correlation (Spearman ρ) and Kruskal Stress-1.',
        actualDisplay: 'Unavailable in Response',
        unavailable: true,
        statusBadge: { label: 'Missing Field', variant: 'amber' },
        definition: 'Spearman correlation and normalized Kruskal Stress-1 across pairwise distances.',
        measures: 'Global metric distortion of projected coordinates.',
        doesNotMeasure: 'N/A — missing field.',
        calculationMethod: `POST /api/v1/evaluate ${id}`,
        actualRaw: 'Field missing from backend response',
        sampleSize: '0',
        limitations: 'Requires backend projection distortion field.',
      });
    } else {
      const ok = detail.status === 'computed' && isFiniteNum(detail.spearman_correlation);
      cards.push({
        id,
        title,
        plainSummary:
          'Measures global distance rank correlation (Spearman ρ) and metric Stress-1 vs. 384D cosine distances.',
        actualDisplay: ok
          ? `ρ = ${formatNumber(detail.spearman_correlation, 4)}`
          : 'Unavailable',
        unavailable: !ok,
        statusBadge: statusToBadge(
          detail.status,
          isFiniteNum(detail.kruskal_stress_1)
            ? `Stress ${formatNumber(detail.kruskal_stress_1, 3)}`
            : undefined
        ),
        paramsDisplay: `pairs=${detail.pair_count.toLocaleString()}, stress1=${isFiniteNum(detail.kruskal_stress_1) ? formatNumber(detail.kruskal_stress_1, 4) : '—'}`,
        definition:
          'Spearman rank correlation and optimal-scale Kruskal Stress-1 between upper-triangle 384D cosine distances and projected Euclidean distances.',
        measures: 'Global distance distortion across corpus pairs.',
        doesNotMeasure: 'Local neighborhood topology or 384D cosine retrieval accuracy.',
        calculationMethod: detail.methodology,
        actualRaw: ok
          ? `spearman=${formatNumber(detail.spearman_correlation, 6)}, pearson=${formatNumber(detail.pearson_correlation, 4)}, stress1=${formatNumber(detail.kruskal_stress_1, 6)}, pairs=${detail.pair_count}`
          : detail.unavailable_reason ?? 'Unavailable',
        sampleSize: `${detail.sample_size} points (${detail.pair_count.toLocaleString()} pairs)`,
        limitations: detail.limitations,
      });
    }
  }

  // Transform Stability
  if (!tStab) {
    cards.push({
      id: 'transform-stability',
      title: 'UMAP Transform Stability',
      plainSummary:
        'Tests whether repeated, permuted, or single-vs-batch transform calls shift projected UMAP coordinates.',
      actualDisplay: meta.hasMissingStepCoords ? 'Invalid Coordinates' : 'Unavailable in Response',
      unavailable: true,
      statusBadge: { label: 'Missing Field', variant: 'amber' },
      definition: 'Coordinate variance across repeated and re-ordered UMAP transforms.',
      measures: 'Out-of-sample transform determinism and batch-order sensitivity.',
      doesNotMeasure: 'N/A — missing field.',
      calculationMethod: 'POST /api/v1/evaluate transform_stability',
      actualRaw: 'Field missing from backend response',
      sampleSize: '0',
      limitations: 'Requires transform_stability in backend response.',
    });
  } else {
    const ok = tStab.status !== 'unavailable';
    const maxDiff = tStab.value;
    cards.push({
      id: 'transform-stability',
      title: 'UMAP Transform Stability',
      plainSummary:
        'Checks determinism under repeated calls, reversed batch order, and single-vs-batch UMAP transforms.',
      actualDisplay: ok && isFiniteNum(maxDiff) ? `Max Δ ${formatNumber(maxDiff, 4)}` : 'Unavailable',
      unavailable: !ok,
      statusBadge: statusToBadge(
        tStab.status,
        tStab.status === 'passed'
          ? 'Invariant'
          : tStab.status === 'partial'
          ? 'Batch Composition Drift'
          : undefined
      ),
      paramsDisplay: `repeat=${isFiniteNum(tStab.repeat_batch_max_diff) ? tStab.repeat_batch_max_diff.toExponential(1) : '—'}, order=${isFiniteNum(tStab.order_invariance_max_diff) ? tStab.order_invariance_max_diff.toExponential(1) : '—'}, single_vs_batch=${isFiniteNum(tStab.single_vs_batch_max_diff) ? formatNumber(tStab.single_vs_batch_max_diff, 4) : '—'}`,
      definition:
        'Maximum Euclidean coordinate difference across (1) repeated batch calls, (2) reversed batch order, and (3) isolated single vs. co-batched transforms on the frozen UMAP fit.',
      measures: 'Out-of-sample UMAP coordinate stability without refitting.',
      doesNotMeasure: '384D cosine steering math (unaffected by UMAP transforms).',
      calculationMethod: tStab.methodology,
      actualRaw: ok
        ? `repeat_max=${tStab.repeat_batch_max_diff}, order_max=${tStab.order_invariance_max_diff}, single_vs_batch_max=${tStab.single_vs_batch_max_diff} (mean=${tStab.single_vs_batch_mean_diff}), tol=${tStab.tolerance}, runs=${tStab.runs}`
        : tStab.unavailable_reason ?? 'Unavailable',
      sampleSize: `${tStab.sample_size} step embeddings × ${tStab.runs} runs`,
      limitations: tStab.limitations,
    });
  }

  return cards;
}
