import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Compass,
  GitCompareArrows,
  Info,
  Layers,
  Play,
  ShieldAlert,
  SlidersHorizontal,
} from 'lucide-react';
import { NeighborList } from '@/components/NeighborList';
import { ViewModeToggle } from '@/components/ViewModeToggle';
import {
  ConceptProgressionChart,
  DisplacementDriftChart,
  PreservationStabilityChart,
  SemanticSpacePlot,
  type SpaceViewMode,
} from '@/components/charts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorAlert,
  Input,
  LoadingState,
  Reveal,
  Select,
  Tooltip,
} from '@/components/ui';
import { useStudio } from '@/hooks/useStudio';
import { evaluateSteering, parseApiError, type ParsedApiError } from '@/services';
import type { ConceptId } from '@/types/api';
import {
  CONTRACT_CONCEPTS,
  formatConceptLabel,
  formatCoordinates,
  formatNumber,
  formatPercent,
  formatSigned,
} from '@/utils/format';

const SWEEP_PRESETS: Record<string, { label: string; strengths: number[] }> = {
  standard: {
    label: 'Standard 9-Point Sweep (step 0.25)',
    strengths: [-1.0, -0.75, -0.5, -0.25, 0.0, 0.25, 0.5, 0.75, 1.0],
  },
  coarse: {
    label: 'Fast 5-Point Sweep (step 0.50)',
    strengths: [-1.0, -0.5, 0.0, 0.5, 1.0],
  },
  fine: {
    label: 'High-Resolution 17-Point Sweep (step 0.125)',
    strengths: [
      -1.0, -0.875, -0.75, -0.625, -0.5, -0.375, -0.25, -0.125, 0.0, 0.125, 0.25, 0.375, 0.5,
      0.625, 0.75, 0.875, 1.0,
    ],
  },
};

function isFiniteNum(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

interface MetricAuditSpec {
  id: string;
  title: string;
  plainSummary: string;
  actualDisplay: string;
  statusBadge?: {
    label: string;
    variant: 'emerald' | 'amber' | 'neutral' | 'cyan' | 'violet' | 'rose';
  };
  unavailable?: boolean;
  definition: string;
  measures: string;
  doesNotMeasure: string;
  calculationMethod: string;
  actualRaw: string;
  sampleSize: string;
  limitations: string;
}

const MetricAuditCard: React.FC<{ spec: MetricAuditSpec }> = ({ spec }) => {
  const unavailableStyle = spec.unavailable
    ? 'border-dashed border-amber-300 bg-amber-50/30'
    : 'border-border bg-background-surface';

  return (
    <Card className={unavailableStyle}>
      <CardContent className="p-4 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-0.5">
            <div className="text-xs font-semibold text-brand-navy">{spec.title}</div>
            <p className="text-[11px] text-text-secondary leading-snug">{spec.plainSummary}</p>
          </div>
          {spec.statusBadge ? (
            <Badge variant={spec.statusBadge.variant} className="shrink-0">
              {spec.statusBadge.label}
            </Badge>
          ) : (
            <Tooltip content={spec.definition} />
          )}
        </div>

        {spec.unavailable ? (
          <div className="flex items-center gap-1.5 text-sm font-mono font-semibold text-amber-800 pt-0.5">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{spec.actualDisplay}</span>
          </div>
        ) : (
          <div className="text-xl font-mono font-bold text-brand-navy tabular-nums pt-0.5">
            {spec.actualDisplay}
          </div>
        )}

        <div className="text-[11px] font-mono text-text-muted">Sample size: {spec.sampleSize}</div>

        <details className="group rounded-xl border border-border-subtle bg-background/80 px-3 py-2 text-[11px] text-text-secondary">
          <summary className="cursor-pointer select-none font-medium text-brand-slate hover:text-brand-navy flex items-center justify-between list-none">
            <span>Researcher Technical Details (7 Criteria)</span>
            <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
          </summary>
          <dl className="mt-2.5 space-y-1.5 border-t border-border-subtle pt-2 leading-relaxed">
            <div>
              <dt className="font-semibold text-brand-navy inline">1. Definition: </dt>
              <dd className="inline">{spec.definition}</dd>
            </div>
            <div>
              <dt className="font-semibold text-brand-navy inline">2. What it measures: </dt>
              <dd className="inline">{spec.measures}</dd>
            </div>
            <div>
              <dt className="font-semibold text-brand-navy inline">3. What it does not measure: </dt>
              <dd className="inline">{spec.doesNotMeasure}</dd>
            </div>
            <div>
              <dt className="font-semibold text-brand-navy inline">4. Calculation method: </dt>
              <dd className="inline font-mono text-[10.5px]">{spec.calculationMethod}</dd>
            </div>
            <div>
              <dt className="font-semibold text-brand-navy inline">5. Actual result: </dt>
              <dd className="inline font-mono text-brand-navy">{spec.actualRaw}</dd>
            </div>
            <div>
              <dt className="font-semibold text-brand-navy inline">6. Sample size: </dt>
              <dd className="inline font-mono">{spec.sampleSize}</dd>
            </div>
            <div>
              <dt className="font-semibold text-brand-navy inline">7. Limitations: </dt>
              <dd className="inline">{spec.limitations}</dd>
            </div>
          </dl>
        </details>
      </CardContent>
    </Card>
  );
};

export const EvaluationDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    config,
    semanticMap,
    loadSemanticMap,
    lastSteerRequest,
    lastSteerResult,
    lastEvaluateRequest,
    lastEvaluateResult,
    setActiveEvaluateRun,
  } = useStudio();

  const concepts = config?.steering.concepts ?? CONTRACT_CONCEPTS;

  const [text, setText] = useState(
    lastEvaluateRequest?.text ??
      lastSteerRequest?.text ??
      'The system architecture is simple, direct, and fast.'
  );
  const [concept, setConcept] = useState<ConceptId>(
    lastEvaluateRequest?.concept ?? lastSteerRequest?.concept ?? 'formal_tone'
  );
  const [sweepKey, setSweepKey] = useState<string>('standard');
  const [topK, setTopK] = useState<number>(lastEvaluateRequest?.top_k_neighbors ?? 5);
  const [viewMode, setViewMode] = useState<SpaceViewMode>('2d');
  const [expandedStrength, setExpandedStrength] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<ParsedApiError | null>(null);
  const [validationError, setValidationError] = useState<string | undefined>();

  useEffect(() => {
    void loadSemanticMap();
  }, [loadSemanticMap]);

  const sortedSteps = useMemo(() => {
    if (!lastEvaluateResult) return [];
    return [...lastEvaluateResult.steps].sort((a, b) => a.strength - b.strength);
  }, [lastEvaluateResult]);

  const baselineComparison = useMemo(() => {
    if (!lastEvaluateResult || sortedSteps.length === 0) return null;
    const minStep = sortedSteps[0];
    const maxStep = sortedSteps[sortedSteps.length - 1];
    const baselineStep = sortedSteps.find((s) => Math.abs(s.strength) < 1e-9);
    const baselineScore = baselineStep
      ? baselineStep.concept_score
      : lastEvaluateResult.base_concept_score;

    return {
      minStep,
      maxStep,
      baselineStep,
      baselineScore,
      positiveDelta:
        isFiniteNum(maxStep.concept_score) && isFiniteNum(baselineScore)
          ? maxStep.concept_score - baselineScore
          : null,
      negativeDelta:
        isFiniteNum(minStep.concept_score) && isFiniteNum(baselineScore)
          ? minStep.concept_score - baselineScore
          : null,
      fullSpan:
        isFiniteNum(maxStep.concept_score) && isFiniteNum(minStep.concept_score)
          ? maxStep.concept_score - minStep.concept_score
          : null,
    };
  }, [lastEvaluateResult, sortedSteps]);

  const baselineNeighborIds = useMemo(() => {
    const baseStep = baselineComparison?.baselineStep;
    if (!baseStep) return null;
    return new Set((baseStep.nearest_neighbors ?? []).map((n) => n.id));
  }, [baselineComparison]);

  const matchingSteerRun = useMemo(() => {
    if (!lastSteerResult || !lastEvaluateResult) return null;
    if (
      lastSteerResult.input_text === lastEvaluateResult.input_text &&
      lastSteerResult.concept === lastEvaluateResult.concept
    ) {
      return lastSteerResult;
    }
    return null;
  }, [lastSteerResult, lastEvaluateResult]);

  const estimatedWordCount = useMemo(() => {
    const trimmed = text.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }, [text]);

  const hasMissingStepCoords = useMemo(() => {
    return sortedSteps.some(
      (s) =>
        !s.coordinates ||
        !isFiniteNum(s.coordinates.x) ||
        !isFiniteNum(s.coordinates.y) ||
        !isFiniteNum(s.coordinates.z)
    );
  }, [sortedSteps]);

  const runEvaluation = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setValidationError('Enter an evaluation sentence (1–1000 characters).');
      return;
    }
    if (trimmed.length > 1000) {
      setValidationError('Input text cannot exceed 1000 characters.');
      return;
    }

    setValidationError(undefined);
    setLoading(true);
    setApiError(null);
    setExpandedStrength(null);

    const preset = SWEEP_PRESETS[sweepKey] ?? SWEEP_PRESETS.standard;
    const payload = {
      text: trimmed,
      concept,
      strengths: preset.strengths,
      top_k_neighbors: topK,
    };

    try {
      const response = await evaluateSteering(payload);
      setActiveEvaluateRun(payload, response);
    } catch (err) {
      setApiError(parseApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runEvaluation();
  };

  const stepSampleLabel = `${sortedSteps.length} strength steps (single input query)`;
  const corpusSampleLabel = semanticMap?.total_points
    ? `${semanticMap.total_points} reference corpus sentences`
    : 'Corpus sample size unavailable';
  const maxSeqLen = config?.model.max_sequence_length ?? 256;

  // Build Goal 1, Goal 2, and Goal 3 metric specs strictly from real backend data
  const goal1Metrics = useMemo<MetricAuditSpec[]>(() => {
    if (!lastEvaluateResult) return [];
    const { monotonicity, linearity_score } = lastEvaluateResult.metrics_summary;
    const rho = monotonicity.spearman_correlation;
    const pearsonR = monotonicity.pearson_correlation;
    const dirCons = monotonicity.directional_consistency;

    return [
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
          'Because E′ = normalize(E + α·D) adds α·D directly, high ρ also holds for non-prose, sarcasm, or gibberish; pair with held-out CV and random-vector controls.',
      },
      {
        id: 'concept-linearity',
        title: 'Linear Response Fit (R² & Pearson r)',
        plainSummary:
          'Measures how closely concept alignment grows linearly rather than jumping erratically across strengths.',
        actualDisplay: isFiniteNum(linearity_score)
          ? `R² = ${formatNumber(linearity_score, 4)}`
          : 'Unavailable',
        unavailable: !isFiniteNum(linearity_score),
        definition:
          'Coefficient of determination (r²) between steering strength λ and concept alignment score.',
        measures:
          'Proportion of concept-score variance explained linearly by steering multiplier λ.',
        doesNotMeasure:
          'Effect size amplitude (how far the score shifted) or absence of cross-concept spillover.',
        calculationMethod:
          'R² = (scipy.stats.pearsonr(strengths, step_concept_scores).statistic)² on backend',
        actualRaw: isFiniteNum(linearity_score)
          ? `R² = ${formatNumber(linearity_score, 6)}, Pearson r = ${formatNumber(pearsonR, 4)}`
          : 'null / non-finite returned by backend',
        sampleSize: stepSampleLabel,
        limitations:
          'Algebraic movement along +D ensures high R² even near spherical saturation bounds; always compare against positive/negative pole Δ vs λ=0.0.',
      },
      {
        id: 'score-progression-consistency',
        title: 'Stepwise Score Progression',
        plainSummary:
          'Share of adjacent slider intervals where increasing strength produced a non-decreasing concept score.',
        actualDisplay: isFiniteNum(dirCons) ? formatPercent(dirCons, 1) : 'Unavailable',
        unavailable: !isFiniteNum(dirCons),
        definition:
          'Fraction of consecutive strength intervals Δλ > 1e-6 satisfying Δ(concept_score) >= -1e-6.',
        measures:
          'Local interval smoothness along the scalar projection score curve across the configured grid.',
        doesNotMeasure:
          '384D displacement angle cos(E′ − E, sign(α)·D) or cross-run repeatability across sessions.',
        calculationMethod:
          'count(score[i+1] - score[i] >= -1e-6) / len(intervals) in backend EvaluationService',
        actualRaw: isFiniteNum(dirCons)
          ? `${formatPercent(dirCons, 2)} (${formatNumber(dirCons, 4)})`
          : 'null / unavailable (degenerate or duplicate strength steps)',
        sampleSize: `${Math.max(0, sortedSteps.length - 1)} adjacent intervals (${sortedSteps.length} steps)`,
        limitations:
          'Only checks adjacent scalar score differences for one run; displacement cosine and multi-sentence CIs are not yet returned by /evaluate.',
      },
      {
        id: 'displacement-alignment-and-specificity',
        title: 'Vector Displacement Alignment & Repeatability',
        plainSummary:
          'Verifies whether the 384D movement vector (E′ − E) aligns with ±D and repeats identically across runs.',
        actualDisplay: 'Unavailable from /evaluate',
        unavailable: true,
        statusBadge: { label: 'Needs Backend Field', variant: 'amber' },
        definition:
          'Cosine alignment cos(E′ − E, sign(α)·D), cross-concept specificity Δ, and multi-run L2 repeatability.',
        measures:
          'Geometric fidelity of the physical displacement step and whether unrelated concepts drift.',
        doesNotMeasure: 'N/A — omitted from current POST /api/v1/evaluate response schema.',
        calculationMethod:
          'Requires per-step cos(E′ - E, sign(α)*D) & all-concept score deltas returned by backend EvaluationService.',
        actualRaw: 'Unavailable (not exposed by current EvaluationResponse contract)',
        sampleSize: '0 in live response (offline benchmark: N = 24 held-out)',
        limitations:
          'Not approximated client-side per contracts/api-contract.md. Proposed as an additive backend extension; offline tests show technical_tone and formal_tone share moderate correlation.',
      },
    ];
  }, [lastEvaluateResult, sortedSteps.length, stepSampleLabel]);

  const goal2Metrics = useMemo<MetricAuditSpec[]>(() => {
    if (!lastEvaluateResult) return [];
    const { preservation_retention, stability_summary } = lastEvaluateResult.metrics_summary;
    const meanPres = preservation_retention.mean_preservation;
    const minPres = preservation_retention.min_preservation;
    const decay = preservation_retention.preservation_decay_rate;
    const meanStab = stability_summary.mean_neighbor_stability;
    const minStab = stability_summary.min_neighbor_stability;
    const retainedMax = stability_summary.retained_original_neighbors_at_max;

    const zeroPres = baselineComparison?.baselineStep?.semantic_preservation;
    const normDrift = matchingSteerRun?.preservation.magnitude_drift;

    return [
      {
        id: 'zero-strength-identity',
        title: 'Zero-Strength Baseline Identity (λ = 0.0)',
        plainSummary:
          'Confirms that setting strength to 0.0 leaves your original meaning completely untouched.',
        actualDisplay: isFiniteNum(zeroPres) ? formatPercent(zeroPres, 2) : 'λ = 0.0 Not in Sweep',
        unavailable: !isFiniteNum(zeroPres),
        statusBadge: isFiniteNum(zeroPres)
          ? Math.abs(zeroPres - 1.0) < 1e-5
            ? { label: 'Exact Baseline', variant: 'emerald' }
            : { label: 'Drift Detected', variant: 'rose' }
          : { label: 'Missing λ=0', variant: 'amber' },
        definition:
          'Cosine similarity cos(E, E′) and neighbor identity evaluated explicitly at control strength λ = 0.0.',
        measures:
          'Experimental control integrity ensuring the pipeline introduces zero unrequested perturbation.',
        doesNotMeasure:
          'Behavior at nonzero |λ| > 0 or encoding accuracy for sentences exceeding 256 tokens.',
        calculationMethod:
          'Exact copy returned by SteeringService.steer_embedding when strength == 0.0; verified at λ = 0.0 step.',
        actualRaw: baselineComparison?.baselineStep
          ? `preservation = ${formatNumber(zeroPres, 6)}, neighbor_stability = ${formatNumber(
              baselineComparison.baselineStep.neighbor_stability,
              6
            )}`
          : 'λ = 0.0 step not present in sweep',
        sampleSize: '1 control step per sweep',
        limitations:
          'Inputs exceeding 256 wordpiece tokens are still truncated during initial encoding even at λ = 0.0.',
      },
      {
        id: 'cosine-preservation-and-drift',
        title: 'Semantic Preservation & Drift (cos(E, E′))',
        plainSummary:
          'Shows how close the steered embedding remains to your original sentence embedding in 384D space.',
        actualDisplay: isFiniteNum(meanPres)
          ? `Mean ${formatPercent(meanPres, 1)}`
          : 'Unavailable',
        unavailable: !isFiniteNum(meanPres),
        statusBadge: isFiniteNum(minPres)
          ? { label: `Min ${formatPercent(minPres, 1)}`, variant: 'cyan' }
          : { label: 'Min Unavailable', variant: 'amber' },
        definition:
          'Average and minimum 384D cosine similarity cos(E, E′) across all sweep strengths, with max drift 1 − min(cos).',
        measures:
          'Angular retention between unsteered and steered unit vectors in 384-dimensional space.',
        doesNotMeasure:
          'Proven semantic equivalence, grammaticality, or preservation of other non-orthogonal style dimensions.',
        calculationMethod:
          'mean(E · E′), min(E · E′), and decay_rate = max(0, 1 − min_preservation) computed on backend',
        actualRaw: isFiniteNum(meanPres)
          ? `mean = ${formatNumber(meanPres, 4)}, min = ${formatNumber(
              minPres,
              4
            )}, decay = ${formatNumber(decay, 4)}`
          : 'Unavailable',
        sampleSize: stepSampleLabel,
        limitations:
          'High cosine does not prevent neighbor shifts or topic substitution; strong |λ| (≥0.75) trades away 20–30% cosine similarity.',
      },
      {
        id: 'neighbor-stability',
        title: '384D Neighborhood Preservation (Jaccard)',
        plainSummary:
          'Checks how many of your sentence’s nearest reference sentences remain nearby after steering.',
        actualDisplay: isFiniteNum(meanStab) ? formatPercent(meanStab, 1) : 'Unavailable',
        unavailable: !isFiniteNum(meanStab),
        definition:
          'Mean Jaccard index |N_k(E) ∩ N_k(E′)| / |N_k(E) ∪ N_k(E′)| over top-K corpus neighbors in 384D cosine space.',
        measures:
          'Local corpus retrieval consistency—whether the steered embedding stays in the same semantic neighborhood.',
        doesNotMeasure:
          'Neighborhood agreement in 2D/3D projected UMAP views or attribute-only disentanglement.',
        calculationMethod:
          'Jaccard overlap of exact vectorized 384D top-K neighbor IDs per step against λ = 0.0 baseline',
        actualRaw: isFiniteNum(meanStab)
          ? `mean = ${formatNumber(meanStab, 4)}, min = ${formatNumber(
              minStab,
              4
            )}, retained @max = ${retainedMax}/${topK}`
          : 'Unavailable',
        sampleSize: `${sortedSteps.length} steps × top-${topK} of ${
          semanticMap?.total_points ?? 'loaded'
        } corpus items`,
        limitations:
          'Sensitivity depends heavily on corpus density around the query and choice of K; large |λ| intentionally pulls neighbors toward concept poles.',
      },
      {
        id: 'vector-norm-validation',
        title: 'Unit-Norm Validation (||E′||₂)',
        plainSummary:
          'Verifies that steered vectors remain valid unit-length embeddings without scale blowup or NaN values.',
        actualDisplay: isFiniteNum(normDrift)
          ? `Drift ${formatNumber(normDrift, 6)}`
          : 'Unavailable in /evaluate',
        unavailable: !isFiniteNum(normDrift),
        statusBadge: isFiniteNum(normDrift)
          ? { label: 'Matched /steer Run', variant: 'emerald' }
          : { label: 'Not in /evaluate', variant: 'amber' },
        definition:
          'Relative L2-norm deviation |||E′||₂ − ||E||₂| / ||E||₂ confirming unit-hypersphere preservation.',
        measures:
          'Numerical normalization stability of output embeddings so cosine similarity stays scale-free.',
        doesNotMeasure:
          'Sweep-wide min/max norms when only a single /steer snapshot was run (or none matched this input).',
        calculationMethod:
          'Backend SteeringService computes abs(||steered|| - ||orig||) / ||orig|| on POST /api/v1/steer.',
        actualRaw: matchingSteerRun
          ? `From matched Vector Steering run (λ=${matchingSteerRun.strength}): magnitude_drift = ${formatNumber(
              normDrift,
              6
            )}, euclid_384d = ${formatNumber(matchingSteerRun.movement.euclidean_distance_384d, 4)}`
          : 'Unavailable in POST /api/v1/evaluate response (run matching sentence & concept in Vector Steering or approve isolated norm field)',
        sampleSize: matchingSteerRun ? '1 matched steer snapshot' : '0 in /evaluate payload',
        limitations:
          '/api/v1/evaluate does not yet include per-step L2 norms; never assumed as 0 without backend telemetry.',
      },
    ];
  }, [
    baselineComparison,
    lastEvaluateResult,
    matchingSteerRun,
    semanticMap?.total_points,
    sortedSteps.length,
    stepSampleLabel,
    topK,
  ]);

  const goal3Metrics = useMemo<MetricAuditSpec[]>(() => {
    if (!lastEvaluateResult) return [];
    const trust3d = lastEvaluateResult.metrics_summary.umap_trustworthiness;
    const hasTrust3d = isFiniteNum(trust3d);

    return [
      {
        id: 'umap-trustworthiness-3d',
        title: '3D UMAP Trustworthiness (k = 15)',
        plainSummary:
          'Checks whether points that look close together in the 3D UMAP chart are genuinely close in 384D meaning space.',
        actualDisplay: hasTrust3d ? formatNumber(trust3d, 4) : 'Unavailable',
        unavailable: !hasTrust3d,
        statusBadge: hasTrust3d
          ? { label: '3D Fitted UMAP', variant: 'emerald' }
          : { label: 'Missing Metric', variant: 'amber' },
        definition:
          'Rank-penalized local precision score (0–1) measuring false neighbors introduced in the 3D UMAP layout relative to 384D cosine space.',
        measures:
          'Absence of misleading false-neighbor overlaps in the fitted 3D projection at neighborhood size k=15.',
        doesNotMeasure:
          'Continuity (dropped true 384D neighbors), 2D (x, y) view fidelity, or global inter-cluster distances.',
        calculationMethod:
          'sklearn.manifold.trustworthiness(embeddings_384d, coords_3d, n_neighbors=15, metric="cosine") on backend',
        actualRaw: hasTrust3d ? `${formatNumber(trust3d, 6)} (3D UMAP corpus fit)` : 'null / unavailable',
        sampleSize: corpusSampleLabel,
        limitations:
          'A high local trustworthiness score does NOT guarantee that long distances or relative cluster sizes on screen match 384D distances.',
      },
      {
        id: 'umap-continuity',
        title: 'UMAP Continuity (2D & 3D)',
        plainSummary:
          'Measures the converse of trustworthiness: whether true 384D neighbors stay close together on the map instead of being torn apart.',
        actualDisplay: 'Unavailable from API',
        unavailable: true,
        statusBadge: { label: 'Needs Backend Field', variant: 'amber' },
        definition:
          'Dual of trustworthiness penalizing true 384D k-nearest neighbors that are pushed outside the k-nearest set in 2D/3D UMAP.',
        measures:
          'Local neighborhood recall preservation without tearing connected semantic clusters apart.',
        doesNotMeasure:
          'Global pairwise stress or whether out-of-sample steered batches shift during transform.',
        calculationMethod:
          'C(k) = 1 - [2 / (n*k*(2n-3k-1))] * Σ_{j ∈ N_k(384D)\\N_k(proj)} (r_proj(i,j) - k); requires backend addition.',
        actualRaw: 'Unavailable (not computed or returned by current backend API)',
        sampleSize: '0 in live API (verified offline in scripts/run_scientific_evaluation.py)',
        limitations:
          'Frontend never approximates manifold metrics client-side per contracts/api-contract.md.',
      },
      {
        id: 'knn-overlap-2d-3d',
        title: '2D vs. 3D Visual Neighborhood Overlap',
        plainSummary:
          'Compares the top-K closest dots on the 2D or 3D plot against the true top-K nearest neighbors in 384D.',
        actualDisplay: 'Unavailable from API',
        unavailable: true,
        statusBadge: { label: 'Needs Backend Field', variant: 'amber' },
        definition:
          'Exact Recall@k and Jaccard overlap between N_k in 384D cosine space and Euclidean N_k in 2D (x, y) and 3D (x, y, z) coordinates.',
        measures:
          'Whether visually adjacent markers on screen agree with VectiQ’s 384D nearest-neighbor retrieval.',
        doesNotMeasure: 'N/A — awaiting isolated backend visualization fidelity endpoint/fields.',
        calculationMethod:
          'Notice: 2D plot currently projects 3D (x, y, z) → (x, y) in SemanticSpacePlot.tsx rather than fitting a separate 2D UMAP.',
        actualRaw: 'Unavailable in live API (see Vector/Map fidelity caveats below)',
        sampleSize: '0 in live API',
        limitations:
          'Dropping the z axis in 2D view further compresses true neighbor overlap compared to 3D; always trust the 384D NeighborList over visual proximity.',
      },
      {
        id: 'projection-distortion-stability',
        title: 'Projection Distortion & Transform Stability',
        plainSummary:
          'Evaluates global distance correlation (Spearman/Stress) and whether batching queries alters projected coordinates.',
        actualDisplay: hasMissingStepCoords ? 'Invalid Coordinates' : 'Unavailable from API',
        unavailable: true,
        statusBadge: hasMissingStepCoords
          ? { label: 'Missing Coords', variant: 'rose' }
          : { label: 'Needs Backend Fix', variant: 'amber' },
        definition:
          'Spearman rank correlation / Kruskal Stress-1 between 384D distances and 2D/3D Euclidean distances, plus batch-vs-single transform delta.',
        measures:
          'How faithfully global map geometry and repeated coordinate placements reflect underlying 384D vectors.',
        doesNotMeasure: 'Cosine similarity math (which runs directly in 384D, unaffected by UMAP).',
        calculationMethod:
          'Requires backend pairwise Shepard diagnostics; also affected by umap.transform(batch) coupling across sweep steps.',
        actualRaw: hasMissingStepCoords
          ? 'One or more returned steps contain missing or non-finite coordinates.'
          : 'Unavailable in current /evaluate payload (steps projected via transform_batch on backend).',
        sampleSize: hasMissingStepCoords ? stepSampleLabel : '0 in live API',
        limitations:
          'Known backend defect: transform_batch causes identical unsteered points to shift slightly depending on co-batched steered vectors.',
      },
    ];
  }, [corpusSampleLabel, hasMissingStepCoords, lastEvaluateResult, stepSampleLabel]);

  return (
    <div className="space-y-6">
      {/* Evaluation Problem-Statement Scope Banner */}
      <Reveal>
        <div className="rounded-2xl border border-border bg-background-surface px-5 py-4 flex items-start gap-3 text-xs text-text-secondary shadow-editorial-sm">
          <Info className="w-4 h-4 text-brand-teal shrink-0 mt-0.5" />
          <div className="space-y-1 leading-relaxed">
            <div className="font-semibold text-brand-navy">
              Scientific Evaluation Dashboard — Three Core Audit Goals
            </div>
            <p>
              This workspace structures every evaluation sweep around the three mandatory goals:{' '}
              <strong>(A) Steering Controllability</strong>,{' '}
              <strong>(B) Embedding Preservation</strong>, and{' '}
              <strong>(C) Visualization Fidelity</strong>. Every metric renders live backend
              measurements alongside plain-language meaning, expandable 7-part researcher details,
              sample size, and honest <code className="font-mono">Unavailable</code> notices when
              a metric is not returned by the API.
            </p>
          </div>
        </div>
      </Reveal>

      {/* Evaluation Parameter Form */}
      <Reveal delayMs={40}>
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-700" />
                Steering Effectiveness Sweep Configuration
              </CardTitle>
              <CardDescription>
                POST /api/v1/evaluate &bull; Tests a baseline sentence across controlled λ ∈ [-1.0,
                +1.0] strengths in 384D space
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
                <div className="lg:col-span-5">
                  <Input
                    label="Evaluation Text"
                    placeholder="Enter a sentence to evaluate across steering strengths…"
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      if (validationError) setValidationError(undefined);
                    }}
                    error={validationError}
                  />
                </div>

                <div className="lg:col-span-2">
                  <Select
                    label="Target Concept"
                    options={concepts.map((c) => ({ value: c.id, label: c.label }))}
                    value={concept}
                    onChange={(val) => setConcept(val as ConceptId)}
                  />
                </div>

                <div className="lg:col-span-3">
                  <Select
                    label="Sweep Resolution"
                    options={Object.entries(SWEEP_PRESETS).map(([k, v]) => ({
                      value: k,
                      label: v.label,
                    }))}
                    value={sweepKey}
                    onChange={setSweepKey}
                  />
                </div>

                <div className="lg:col-span-2">
                  <Select
                    label="Top-K Neighbors"
                    options={[
                      { value: '3', label: 'Top 3' },
                      { value: '5', label: 'Top 5' },
                      { value: '10', label: 'Top 10' },
                    ]}
                    value={String(topK)}
                    onChange={(val) => setTopK(Number(val))}
                  />
                </div>
              </div>

              {estimatedWordCount > 180 && (
                <div className="rounded-xl border border-amber-300 bg-amber-50/70 px-3.5 py-2.5 flex items-start gap-2 text-xs text-amber-900">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
                  <span>
                    <strong>Truncation advisory:</strong> This input has {estimatedWordCount}{' '}
                    whitespace words.{' '}
                    <code className="font-mono">all-MiniLM-L6-v2</code> silently truncates text
                    beyond <code className="font-mono">{maxSeqLen}</code> wordpiece tokens.
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className="text-[11px] font-mono text-text-muted">
                  Chars: {text.trim().length}/1000 &bull; Approx words: {estimatedWordCount} &bull;
                  Model max tokens: {maxSeqLen}
                </span>
                <Button type="submit" loading={loading} leftIcon={<Play className="w-4 h-4" />}>
                  Run Evaluation Sweep
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </Reveal>

      {loading ? (
        <LoadingState
          title="Running Multi-Step Steering Evaluation…"
          description="Evaluating concept alignment, semantic preservation, and neighbor stability across all strengths."
        />
      ) : apiError ? (
        <ErrorAlert error={apiError} onRetry={() => void runEvaluation()} />
      ) : !lastEvaluateResult ? (
        <EmptyState
          icon={<BarChart3 className="w-5 h-5" />}
          title="No Evaluation Sweep Results Yet"
          description="Configure a sentence and sweep resolution above, then run POST /api/v1/evaluate to inspect quantitative Goal 1, Goal 2, and Goal 3 metrics from the backend."
        />
      ) : (
        <>
          {/* Factual Run Header */}
          <Reveal delayMs={50}>
            <Card className="border-emerald-200 bg-emerald-50/40">
              <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="emerald">
                      {formatConceptLabel(lastEvaluateResult.concept, concepts)}
                    </Badge>
                    <Badge variant="cyan">{sortedSteps.length} Strength Steps</Badge>
                    <Badge
                      variant={
                        lastEvaluateResult.metrics_summary.monotonicity.is_monotonic
                          ? 'emerald'
                          : 'amber'
                      }
                    >
                      {lastEvaluateResult.metrics_summary.monotonicity.is_monotonic
                        ? 'Strictly Monotonic'
                        : 'Non-Monotonic Segments'}
                    </Badge>
                  </div>
                  <p className="text-xs text-text-secondary">
                    Evaluated text: &ldquo;{lastEvaluateResult.input_text}&rdquo; &bull; Base
                    unsteered concept score:{' '}
                    <span className="font-mono font-semibold text-brand-navy">
                      {formatNumber(lastEvaluateResult.base_concept_score, 4)}
                    </span>
                  </p>
                </div>
              </CardContent>
            </Card>
          </Reveal>

          {/* ============================================================== */}
          {/* SECTION A: STEERING CONTROLLABILITY                            */}
          {/* ============================================================== */}
          <Reveal delayMs={60}>
            <section aria-labelledby="goal-a-heading" className="space-y-4">
              <div className="rounded-2xl border border-brand-navy/20 bg-background-surface p-5 shadow-editorial-sm space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-brand-teal" />
                    <h2 id="goal-a-heading" className="text-base font-semibold text-brand-navy">
                      Section A — Goal 1: Steering Controllability
                    </h2>
                  </div>
                  <Badge variant="violet">
                    Direction: {formatConceptLabel(lastEvaluateResult.concept, concepts)}
                  </Badge>
                </div>
                <p className="text-sm text-brand-navy font-medium">
                  &ldquo;Does increasing the steering strength change the embedding in the intended
                  direction, and does the change behave consistently?&rdquo;
                </p>
                <p className="text-xs text-text-secondary leading-relaxed">
                  Steering operates on normalized 384D vectors via{' '}
                  <code className="font-mono">E&prime; = normalize(E + &alpha; &middot; D)</code>.
                  Because steering alters vector coordinates rather than rewriting text with a
                  language generator, concept alignment measures movement along the learned{' '}
                  <code className="font-mono">{lastEvaluateResult.concept}</code> axis, not human
                  linguistic tone fluency.
                </p>
                {(lastEvaluateResult.concept === 'technical_tone' ||
                  lastEvaluateResult.concept === 'formal_tone') && (
                  <p className="text-xs text-amber-800 bg-amber-50/70 border border-amber-200 rounded-xl px-3 py-2">
                    <strong>Attribute specificity note:</strong>{' '}
                    <code className="font-mono">technical_tone</code> and{' '}
                    <code className="font-mono">formal_tone</code> share partial geometric alignment
                    in the reference corpus, so strongly steering one can modestly increase scores
                    on the other.
                  </p>
                )}
              </div>

              {/* Controlled Baseline vs. Negative / Positive Poles */}
              {baselineComparison && (
                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle className="text-brand-navy">
                        Baseline Control vs. Negative &amp; Positive Poles
                      </CardTitle>
                      <CardDescription>
                        Compares steered endpoints directly against the unsteered baseline (λ = 0.0)
                      </CardDescription>
                    </div>
                    <Badge variant="violet">
                      Total Span {formatSigned(baselineComparison.fullSpan, 4)}
                    </Badge>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                      <div className="rounded-xl border border-border bg-background p-3.5 space-y-1">
                        <div className="font-mono text-text-muted">
                          Negative Pole (λ = {formatSigned(baselineComparison.minStep.strength, 2)})
                        </div>
                        <div className="text-base font-mono font-semibold text-brand-navy tabular-nums">
                          Score {formatNumber(baselineComparison.minStep.concept_score, 4)}
                        </div>
                        <div className="text-[11px] font-mono text-text-secondary">
                          Δ vs baseline: {formatSigned(baselineComparison.negativeDelta, 4)}
                        </div>
                      </div>

                      <div className="rounded-xl border border-brand-slate/30 bg-slate-50/70 p-3.5 space-y-1">
                        <div className="font-mono text-brand-slate font-medium">
                          Unsteered Control (λ = 0.00)
                        </div>
                        <div className="text-base font-mono font-semibold text-brand-navy tabular-nums">
                          Score {formatNumber(baselineComparison.baselineScore, 4)}
                        </div>
                        <div className="text-[11px] font-mono text-text-secondary">
                          Baseline reference (Δ = 0.0000)
                        </div>
                      </div>

                      <div className="rounded-xl border border-brand-teal/30 bg-teal-50/40 p-3.5 space-y-1">
                        <div className="font-mono text-brand-teal font-medium">
                          Positive Pole (λ = {formatSigned(baselineComparison.maxStep.strength, 2)})
                        </div>
                        <div className="text-base font-mono font-semibold text-brand-navy tabular-nums">
                          Score {formatNumber(baselineComparison.maxStep.concept_score, 4)}
                        </div>
                        <div className="text-[11px] font-mono text-text-secondary">
                          Δ vs baseline: {formatSigned(baselineComparison.positiveDelta, 4)}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {goal1Metrics.map((spec) => (
                  <MetricAuditCard key={spec.id} spec={spec} />
                ))}
              </div>

              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Strength–Response Curve</CardTitle>
                    <CardDescription>
                      Target concept alignment score across steering strengths λ relative to the λ
                      = 0 baseline
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <ConceptProgressionChart
                    steps={sortedSteps}
                    baseConceptScore={lastEvaluateResult.base_concept_score}
                  />
                </CardContent>
              </Card>
            </section>
          </Reveal>

          {/* ============================================================== */}
          {/* SECTION B: EMBEDDING PRESERVATION                              */}
          {/* ============================================================== */}
          <Reveal delayMs={75}>
            <section aria-labelledby="goal-b-heading" className="space-y-4">
              <div className="rounded-2xl border border-brand-slate/25 bg-background-surface p-5 shadow-editorial-sm space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-brand-slate" />
                    <h2 id="goal-b-heading" className="text-base font-semibold text-brand-navy">
                      Section B — Goal 2: Embedding Preservation
                    </h2>
                  </div>
                  <Badge variant="cyan">384D Semantic Retention</Badge>
                </div>
                <p className="text-sm text-brand-navy font-medium">
                  &ldquo;After changing the representation, how much of its original semantic
                  information remains?&rdquo;
                </p>
                <div className="rounded-xl border border-border-subtle bg-background px-3.5 py-2.5 text-xs text-text-secondary leading-relaxed">
                  <strong className="text-brand-navy">
                    Numerical Similarity vs. Semantic Equivalence:
                  </strong>{' '}
                  Cosine similarity (<code className="font-mono">cos(E, E&prime;)</code>) tracks
                  geometric proximity on the 384D unit sphere, <em>not</em> proven paraphrase
                  equivalence. Stronger steering (<code className="font-mono">|λ| &ge; 0.75</code>)
                  deliberately trades away cosine retention and original corpus neighbors in order to
                  move across concept poles.
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {goal2Metrics.map((spec) => (
                  <MetricAuditCard key={spec.id} spec={spec} />
                ))}
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle>Semantic Preservation vs. Neighbor Stability</CardTitle>
                      <CardDescription>
                        How 384D cosine retention and top-{topK} corpus neighborhood overlap shift as
                        |λ| increases
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <PreservationStabilityChart steps={sortedSteps} />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle>Embedding Displacement &amp; Cosine Drift vs. Strength</CardTitle>
                      <CardDescription>
                        384D cosine drift (1 − cos) alongside projected 3D UMAP trajectory shift
                        from λ = 0.0
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <DisplacementDriftChart steps={sortedSteps} />
                  </CardContent>
                </Card>
              </div>
            </section>
          </Reveal>

          {/* ============================================================== */}
          {/* SECTION C: VISUALIZATION FIDELITY                              */}
          {/* ============================================================== */}
          <Reveal delayMs={90}>
            <section aria-labelledby="goal-c-heading" className="space-y-4">
              <div className="rounded-2xl border border-brand-teal/25 bg-background-surface p-5 shadow-editorial-sm space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Compass className="w-4 h-4 text-brand-teal" />
                    <h2 id="goal-c-heading" className="text-base font-semibold text-brand-navy">
                      Section C — Goal 3: Visualization Fidelity
                    </h2>
                  </div>
                  <Badge variant="emerald">384D → UMAP Projection Audit</Badge>
                </div>
                <p className="text-sm text-brand-navy font-medium">
                  &ldquo;Does the 2D or 3D map preserve meaningful relationships from the original
                  high-dimensional space?&rdquo;
                </p>
                <p className="text-xs text-text-secondary leading-relaxed">
                  <strong>Projection vs. Source Space:</strong> The map below is a{' '}
                  <strong>lossy UMAP dimensionality-reduction projection</strong> fitted once on{' '}
                  {semanticMap?.total_points ?? 'reference'} corpus embeddings—not the original
                  384D embedding space. Furthermore, <strong>2D mode</strong> renders the{' '}
                  <code className="font-mono">(x, y)</code> slice of the 3D UMAP coordinates rather
                  than fitting a separate 2D UMAP reducer. All cosine scores and nearest neighbors are
                  computed strictly in 384D.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {goal3Metrics.map((spec) => (
                  <MetricAuditCard key={spec.id} spec={spec} />
                ))}
              </div>

              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Multi-Step Steering Trajectory in UMAP Space</CardTitle>
                    <CardDescription>
                      Compare 2D (x, y) slice vs. 3D (x, y, z) UMAP path from λ = -1.0 through +1.0
                    </CardDescription>
                  </div>
                  <ViewModeToggle mode={viewMode} onChange={setViewMode} />
                </CardHeader>
                <CardContent>
                  <SemanticSpacePlot
                    mode={viewMode}
                    semanticMap={semanticMap}
                    trajectorySteps={sortedSteps}
                    heightClassName="h-[420px]"
                    emptyTitle="No Trajectory Points Returned"
                    emptyDescription="No evaluation steps were returned by the backend."
                  />
                </CardContent>
              </Card>
            </section>
          </Reveal>

          {/* Step-by-Step Telemetry Table */}
          <Reveal delayMs={100}>
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Step-by-Step Evaluation Telemetry</CardTitle>
                  <CardDescription>
                    Inspect exact 384D metrics, UMAP projection coordinates, and top-{topK} 384D
                    nearest neighbors per strength step
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {sortedSteps.length === 0 ? (
                  <EmptyState
                    title="No Step Rows Returned"
                    description="POST /api/v1/evaluate returned zero strength steps."
                  />
                ) : (
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-border text-text-muted font-mono">
                        <th className="py-2.5 pr-4">Strength (λ)</th>
                        <th className="py-2.5 pr-4">Concept Score</th>
                        <th className="py-2.5 pr-4">Preservation</th>
                        <th className="py-2.5 pr-4">Neighbor Stability</th>
                        <th className="py-2.5 pr-4">Turnover (vs λ=0)</th>
                        <th className="py-2.5 pr-4">UMAP Coords</th>
                        <th className="py-2.5 pr-4">Top Nearest Neighbor</th>
                        <th className="py-2.5 text-right">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                      {sortedSteps.map((step) => {
                        const neighborsList = step.nearest_neighbors ?? [];
                        const topNeighbor = neighborsList[0];
                        const isExpanded = expandedStrength === step.strength;
                        const stepIds = new Set(neighborsList.map((n) => n.id));
                        const enteredCount = baselineNeighborIds
                          ? [...stepIds].filter((id) => !baselineNeighborIds.has(id)).length
                          : null;
                        const exitedCount = baselineNeighborIds
                          ? [...baselineNeighborIds].filter((id) => !stepIds.has(id)).length
                          : null;

                        return (
                          <React.Fragment key={step.strength}>
                            <tr
                              className={
                                step.strength === 0
                                  ? 'bg-slate-50 hover:bg-slate-100/70'
                                  : 'hover:bg-background/70'
                              }
                            >
                              <td className="py-2.5 pr-4 font-mono font-semibold text-brand-navy whitespace-nowrap">
                                {formatSigned(step.strength, 3)}
                                {step.strength === 0 && (
                                  <span className="ml-2 text-[10px] text-brand-slate">(base)</span>
                                )}
                              </td>
                              <td className="py-2.5 pr-4 font-mono font-medium text-brand-navy">
                                {formatNumber(step.concept_score, 4)}
                              </td>
                              <td className="py-2.5 pr-4 font-mono font-medium text-emerald-700">
                                {formatPercent(step.semantic_preservation, 1)}
                              </td>
                              <td className="py-2.5 pr-4 font-mono font-medium text-brand-teal">
                                {formatPercent(step.neighbor_stability, 1)}
                              </td>
                              <td className="py-2.5 pr-4 font-mono text-[11px] whitespace-nowrap">
                                {enteredCount !== null && exitedCount !== null ? (
                                  <span>
                                    <span className="text-emerald-700">+{enteredCount}</span> /{' '}
                                    <span className="text-rose-700">-{exitedCount}</span>
                                  </span>
                                ) : (
                                  <span className="text-text-muted">—</span>
                                )}
                              </td>
                              <td className="py-2.5 pr-4 font-mono text-text-muted whitespace-nowrap">
                                {formatCoordinates(step.coordinates, 2)}
                              </td>
                              <td className="py-2.5 pr-4 text-text-secondary max-w-md truncate">
                                {topNeighbor
                                  ? `${topNeighbor.text} (${formatNumber(topNeighbor.cosine_similarity, 3)})`
                                  : '—'}
                              </td>
                              <td className="py-2.5 text-right">
                                <button
                                  type="button"
                                  aria-expanded={isExpanded}
                                  onClick={() =>
                                    setExpandedStrength(isExpanded ? null : step.strength)
                                  }
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border bg-background-surface text-[11px] font-mono text-text-secondary hover:text-brand-navy hover:border-brand-slate/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-slate/40"
                                >
                                  {isExpanded ? (
                                    <>
                                      <span>Hide</span>
                                      <ChevronUp className="w-3 h-3" />
                                    </>
                                  ) : (
                                    <>
                                      <span>Neighbors ({neighborsList.length})</span>
                                      <ChevronDown className="w-3 h-3" />
                                    </>
                                  )}
                                </button>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr className="bg-background/80">
                                <td colSpan={8} className="p-4">
                                  <NeighborList
                                    items={neighborsList}
                                    accent={step.strength >= 0 ? 'violet' : 'cyan'}
                                    highlightIds={
                                      baselineNeighborIds && Math.abs(step.strength) > 1e-9
                                        ? new Set(
                                            neighborsList
                                              .filter((n) => !baselineNeighborIds.has(n.id))
                                              .map((n) => n.id)
                                          )
                                        : undefined
                                    }
                                    highlightLabel="New vs λ=0"
                                    highlightVariant="emerald"
                                    retainedIds={baselineNeighborIds ?? undefined}
                                    onSelectForSteering={(item) =>
                                      navigate('/steering', { state: { prefillText: item.text } })
                                    }
                                    emptyText="No nearest neighbors returned for this step."
                                  />
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </Reveal>

          {/* Cross-Feature Workflow Bar */}
          <Reveal delayMs={110}>
            <div className="rounded-2xl border border-border bg-background-surface px-5 py-4 flex flex-wrap items-center justify-between gap-3 shadow-editorial-sm">
              <div className="text-xs text-text-secondary">
                <strong className="text-brand-navy">Explore across studio tools:</strong>{' '}
                Inspect a single steering strength side-by-side or browse corpus clusters directly.
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link to="/explorer">
                  <Button variant="outline" size="sm" leftIcon={<Compass className="w-3.5 h-3.5" />}>
                    Semantic Explorer
                  </Button>
                </Link>
                <Link to="/steering">
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<SlidersHorizontal className="w-3.5 h-3.5" />}
                  >
                    Vector Steering
                  </Button>
                </Link>
                <Link to="/comparison">
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={<GitCompareArrows className="w-3.5 h-3.5" />}
                  >
                    Comparison Lab
                  </Button>
                </Link>
              </div>
            </div>
          </Reveal>
        </>
      )}
    </div>
  );
};
