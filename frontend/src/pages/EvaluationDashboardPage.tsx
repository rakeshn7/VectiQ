import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, CheckCircle2, ChevronDown, ChevronUp, Info, Play, ShieldAlert } from 'lucide-react';
import { NeighborList } from '@/components/NeighborList';
import { ViewModeToggle } from '@/components/ViewModeToggle';
import {
  ConceptProgressionChart,
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

export const EvaluationDashboardPage: React.FC = () => {
  const {
    config,
    semanticMap,
    loadSemanticMap,
    lastSteerRequest,
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

  return (
    <div className="space-y-6">
      {/* Evaluation Parameter Form */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-accent-emerald" />
              Steering Effectiveness Sweep Configuration
            </CardTitle>
            <CardDescription>
              POST /api/v1/evaluate &bull; Evaluates concept control, preservation, neighbor
              stability, and monotonicity across λ ∈ [-1.0, +1.0]
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

            <div className="flex items-center justify-end">
              <Button
                type="submit"
                loading={loading}
                leftIcon={<Play className="w-4 h-4" />}
              >
                Run Evaluation Sweep
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

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
          description="Configure a sentence and sweep resolution above, then run POST /api/v1/evaluate to inspect quantitative steering performance metrics from the backend."
        />
      ) : (
        <>
          {/* Factual Experiment Summary Header */}
          <Card className="border-emerald-500/25">
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
                  Evaluated text: &ldquo;{lastEvaluateResult.input_text}&rdquo; &bull; Base concept
                  score:{' '}
                  <span className="font-mono text-text-primary">
                    {formatNumber(lastEvaluateResult.base_concept_score, 4)}
                  </span>
                </p>
              </div>
            </CardContent>
          </Card>

          {/* 5 Evaluation Concept Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
            {/* 1. Concept Control */}
            <Card>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between text-xs text-text-muted">
                  <span className="font-medium text-text-secondary">Concept Control</span>
                  <Tooltip content="R² linear fit coefficient measuring how linearly concept alignment responds to steering strength λ." />
                </div>
                <div className="text-xl font-mono font-bold text-accent-cyan tabular-nums">
                  R² = {formatNumber(lastEvaluateResult.metrics_summary.linearity_score, 4)}
                </div>
                <p className="text-[11px] text-text-muted leading-relaxed">
                  Linearity across {sortedSteps.length} strengths; base score{' '}
                  <span className="font-mono text-text-secondary">
                    {formatNumber(lastEvaluateResult.base_concept_score, 3)}
                  </span>
                  .
                </p>
              </CardContent>
            </Card>

            {/* 2. Steering Monotonicity */}
            <Card>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between text-xs text-text-muted">
                  <span className="font-medium text-text-secondary">Steering Monotonicity</span>
                  <Tooltip content="Spearman rank correlation between steering strength and concept score (+1.0 indicates strictly monotonic progression)." />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-mono font-bold text-emerald-300 tabular-nums">
                    ρ ={' '}
                    {formatNumber(
                      lastEvaluateResult.metrics_summary.monotonicity.spearman_correlation,
                      4
                    )}
                  </span>
                  {lastEvaluateResult.metrics_summary.monotonicity.is_monotonic && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  )}
                </div>
                <p className="text-[11px] text-text-muted leading-relaxed">
                  Pearson r=
                  {formatNumber(
                    lastEvaluateResult.metrics_summary.monotonicity.pearson_correlation,
                    3
                  )}{' '}
                  &bull; Consistency{' '}
                  {formatPercent(
                    lastEvaluateResult.metrics_summary.monotonicity.directional_consistency,
                    0
                  )}
                </p>
              </CardContent>
            </Card>

            {/* 3. Semantic Preservation */}
            <Card>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between text-xs text-text-muted">
                  <span className="font-medium text-text-secondary">Semantic Preservation</span>
                  <Tooltip content="Mean and minimum 384D cosine similarity retained relative to the unsteered baseline vector." />
                </div>
                <div className="text-xl font-mono font-bold text-sky-300 tabular-nums">
                  {formatPercent(
                    lastEvaluateResult.metrics_summary.preservation_retention.mean_preservation,
                    1
                  )}
                </div>
                <p className="text-[11px] text-text-muted leading-relaxed">
                  Min:{' '}
                  {formatPercent(
                    lastEvaluateResult.metrics_summary.preservation_retention.min_preservation,
                    1
                  )}{' '}
                  &bull; Decay:{' '}
                  {formatNumber(
                    lastEvaluateResult.metrics_summary.preservation_retention.preservation_decay_rate,
                    3
                  )}
                </p>
              </CardContent>
            </Card>

            {/* 4. Neighbor Stability */}
            <Card>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between text-xs text-text-muted">
                  <span className="font-medium text-text-secondary">Neighbor Stability</span>
                  <Tooltip content="Average Jaccard overlap between baseline top-K neighbors and steered top-K neighbors." />
                </div>
                <div className="text-xl font-mono font-bold text-purple-300 tabular-nums">
                  {formatPercent(
                    lastEvaluateResult.metrics_summary.stability_summary.mean_neighbor_stability,
                    1
                  )}
                </div>
                <p className="text-[11px] text-text-muted leading-relaxed">
                  Min:{' '}
                  {formatPercent(
                    lastEvaluateResult.metrics_summary.stability_summary.min_neighbor_stability,
                    1
                  )}{' '}
                  &bull; Retained @max:{' '}
                  {
                    lastEvaluateResult.metrics_summary.stability_summary
                      .retained_original_neighbors_at_max
                  }
                </p>
              </CardContent>
            </Card>

            {/* 5. UMAP Trustworthiness */}
            {typeof lastEvaluateResult.metrics_summary.umap_trustworthiness === 'number' ? (
              <Card>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs text-text-muted">
                    <span className="font-medium text-text-secondary">UMAP Trustworthiness</span>
                    <Tooltip content="Measures how faithfully local neighborhoods in 384D embedding space are preserved in the fitted 3D UMAP projection (0.0 – 1.0)." />
                  </div>
                  <div className="text-xl font-mono font-bold text-amber-300 tabular-nums">
                    {formatNumber(lastEvaluateResult.metrics_summary.umap_trustworthiness, 4)}
                  </div>
                  <p className="text-[11px] text-text-muted leading-relaxed">
                    Local 384D-to-UMAP neighborhood preservation score returned by backend.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-dashed border-border">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs text-text-muted">
                    <span className="font-medium text-text-secondary">UMAP Trustworthiness</span>
                    <Tooltip content="UMAP trustworthiness measures local neighborhood preservation between 384D embeddings and UMAP projection." />
                  </div>
                  <div className="flex items-center gap-1.5 text-sm font-mono font-semibold text-amber-300">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>Unavailable</span>
                  </div>
                  <p className="text-[11px] text-text-muted leading-relaxed">
                    Not returned by this backend response.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Interactive Evaluation Charts */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Concept Control Curve</CardTitle>
                  <CardDescription>
                    Concept alignment score across steering strengths λ
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

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Preservation vs. Neighbor Stability</CardTitle>
                  <CardDescription>
                    Trade-off between meaning retention and local corpus neighborhood overlap
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <PreservationStabilityChart steps={sortedSteps} />
              </CardContent>
            </Card>
          </div>

          {/* Multi-Step Semantic Trajectory */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Multi-Step Steering Trajectory in UMAP Space</CardTitle>
                <CardDescription>
                  Path traced across the fitted UMAP projection from λ = -1.0 through +1.0
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

          {/* Step-by-Step Table */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Step-by-Step Evaluation Telemetry</CardTitle>
                <CardDescription>
                  Click any row to inspect all nearest neighbors returned at that strength
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
                      <th className="py-2.5 pr-4">UMAP Coords</th>
                      <th className="py-2.5 pr-4">Top Nearest Neighbor</th>
                      <th className="py-2.5 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {sortedSteps.map((step) => {
                      const topNeighbor = step.nearest_neighbors[0];
                      const isExpanded = expandedStrength === step.strength;
                      return (
                        <React.Fragment key={step.strength}>
                          <tr
                            className={
                              step.strength === 0
                                ? 'bg-sky-500/5 hover:bg-sky-500/10'
                                : 'hover:bg-background/50'
                            }
                          >
                            <td className="py-2.5 pr-4 font-mono font-semibold text-text-primary whitespace-nowrap">
                              {formatSigned(step.strength, 3)}
                              {step.strength === 0 && (
                                <span className="ml-2 text-[10px] text-accent-cyan">(base)</span>
                              )}
                            </td>
                            <td className="py-2.5 pr-4 font-mono text-accent-cyan">
                              {formatNumber(step.concept_score, 4)}
                            </td>
                            <td className="py-2.5 pr-4 font-mono text-emerald-300">
                              {formatPercent(step.semantic_preservation, 1)}
                            </td>
                            <td className="py-2.5 pr-4 font-mono text-purple-300">
                              {formatPercent(step.neighbor_stability, 1)}
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
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border text-[11px] font-mono text-text-secondary hover:text-text-primary hover:border-accent-cyan/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan/50"
                              >
                                {isExpanded ? (
                                  <>
                                    <span>Hide</span>
                                    <ChevronUp className="w-3 h-3" />
                                  </>
                                ) : (
                                  <>
                                    <span>Neighbors ({step.nearest_neighbors.length})</span>
                                    <ChevronDown className="w-3 h-3" />
                                  </>
                                )}
                              </button>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-background/70">
                              <td colSpan={7} className="p-4">
                                <NeighborList
                                  items={step.nearest_neighbors}
                                  accent={step.strength >= 0 ? 'violet' : 'cyan'}
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

          {/* Grounded Interpretation Note */}
          <div className="rounded-xl border border-border bg-background-surface/60 p-4 flex items-start gap-3 text-xs text-text-secondary">
            <Info className="w-4 h-4 text-accent-cyan shrink-0 mt-0.5" />
            <div className="space-y-1 leading-relaxed">
              <div className="font-semibold text-text-primary">Backend Telemetry Summary</div>
              <p>
                For &ldquo;{lastEvaluateResult.input_text}&rdquo; along{' '}
                <code className="font-mono text-accent-cyan">{lastEvaluateResult.concept}</code>, the
                backend reported Spearman monotonicity{' '}
                <code className="font-mono text-text-primary">
                  {formatNumber(
                    lastEvaluateResult.metrics_summary.monotonicity.spearman_correlation,
                    4
                  )}
                </code>
                , linearity{' '}
                <code className="font-mono text-text-primary">
                  {formatNumber(lastEvaluateResult.metrics_summary.linearity_score, 4)}
                </code>
                , and mean semantic preservation{' '}
                <code className="font-mono text-text-primary">
                  {formatPercent(
                    lastEvaluateResult.metrics_summary.preservation_retention.mean_preservation,
                    1
                  )}
                </code>
                {typeof lastEvaluateResult.metrics_summary.umap_trustworthiness === 'number' && (
                  <>
                    , with UMAP trustworthiness{' '}
                    <code className="font-mono text-text-primary">
                      {formatNumber(lastEvaluateResult.metrics_summary.umap_trustworthiness, 4)}
                    </code>
                  </>
                )}
                . All numbers reflect direct backend measurements with no client-side approximation.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
