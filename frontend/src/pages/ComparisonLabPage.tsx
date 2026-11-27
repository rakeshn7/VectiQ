import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  ChevronDown,
  Compass,
  GitCompareArrows,
  Info,
  Play,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { NeighborList } from '@/components/NeighborList';
import { ViewModeToggle } from '@/components/ViewModeToggle';
import {
  NeighborSimilarityChart,
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
  Slider,
} from '@/components/ui';
import { useStudio } from '@/hooks/useStudio';
import { parseApiError, steerEmbedding, type ParsedApiError } from '@/services';
import type { ConceptId } from '@/types/api';
import {
  CONTRACT_CONCEPTS,
  CONTRACT_STEERING_BOUNDS,
  formatConceptLabel,
  formatCoordinates,
  formatEmbeddingSlice,
  formatNumber,
  formatPercent,
  formatSigned,
} from '@/utils/format';

/** Compact geometric unit-arc diagram rendered from backend cosine/angle telemetry. */
const VectorMovementDiagram: React.FC<{
  angleDegrees: number;
  cosineSimilarity: number;
  euclideanDistance: number;
  strength: number;
  conceptLabel: string;
}> = ({ angleDegrees, cosineSimilarity, euclideanDistance, strength, conceptLabel }) => {
  const safeDeg = Number.isFinite(angleDegrees) ? Math.max(0, Math.min(180, angleDegrees)) : 0;
  const thetaRad = (safeDeg * Math.PI) / 180;
  const r = 74;
  const cx = 36;
  const cy = 104;
  const xOrig = cx + r;
  const yOrig = cy;
  const signDir = strength < 0 ? 1 : -1;
  const xSteered = cx + r * Math.cos(thetaRad);
  const ySteered = cy + signDir * r * Math.sin(thetaRad);
  const largeArc = safeDeg > 180 ? 1 : 0;
  const sweepFlag = signDir < 0 ? 0 : 1;

  return (
    <div className="rounded-xl border border-border bg-background/70 p-4 flex flex-col sm:flex-row items-center gap-5">
      <svg
        viewBox="0 0 180 140"
        className="w-44 h-36 shrink-0"
        role="img"
        aria-label={`Vector movement angle diagram: ${formatNumber(angleDegrees, 2)} degrees`}
      >
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#E2DFD7" strokeDasharray="3 3" />
        {/* Baseline E axis */}
        <line x1={cx} y1={cy} x2={xOrig} y2={yOrig} stroke="#1B2E4B" strokeWidth={2.5} />
        <circle cx={xOrig} cy={yOrig} r={4} fill="#1B2E4B" />
        {/* Angle arc */}
        {safeDeg > 0.5 && (
          <path
            d={`M ${xOrig} ${yOrig} A ${r} ${r} 0 ${largeArc} ${sweepFlag} ${xSteered.toFixed(
              1
            )} ${ySteered.toFixed(1)}`}
            fill="none"
            stroke="#B45309"
            strokeWidth={1.75}
            strokeDasharray="3 2"
          />
        )}
        {/* Steered E' axis */}
        <line x1={cx} y1={cy} x2={xSteered} y2={ySteered} stroke="#0F766E" strokeWidth={2.5} />
        <circle cx={xSteered} cy={ySteered} r={4} fill="#0F766E" />
        {/* Chord displacement E' - E */}
        {safeDeg > 0.5 && (
          <line
            x1={xOrig}
            y1={yOrig}
            x2={xSteered}
            y2={ySteered}
            stroke="#3E5C8A"
            strokeWidth={1.5}
            strokeDasharray="2 2"
          />
        )}
        <circle cx={cx} cy={cy} r={2.5} fill="#64748B" />
        <text x={xOrig + 6} y={yOrig + 4} fontSize="10" fill="#1B2E4B" fontFamily="monospace">
          E (λ=0)
        </text>
        <text
          x={Math.min(xSteered + 6, 128)}
          y={ySteered + (signDir < 0 ? -4 : 12)}
          fontSize="10"
          fill="#0F766E"
          fontFamily="monospace"
        >
          E′
        </text>
      </svg>

      <div className="space-y-1.5 text-xs text-text-secondary leading-relaxed">
        <div className="font-semibold text-brand-navy">
          384D Angular Displacement Schematic (Exact Telemetry)
        </div>
        <p>
          Planar 2D slice of the angle between unsteered <code className="font-mono">E</code> and
          steered <code className="font-mono">E&prime;</code> along{' '}
          <strong className="text-brand-navy">{conceptLabel}</strong>: rotation{' '}
          <code className="font-mono text-brand-navy">&theta; = {formatNumber(angleDegrees, 2)}&deg;</code>,
          cosine retention{' '}
          <code className="font-mono text-brand-teal">{formatNumber(cosineSimilarity, 4)}</code>,
          chord displacement{' '}
          <code className="font-mono text-brand-slate">
            ||E&prime; &minus; E||₂ = {formatNumber(euclideanDistance, 4)}
          </code>
          .
        </p>
        <p className="text-[11px] text-text-muted">
          Steering shifts coordinates inside 384D space to test geometric behavior; it does not
          automatically rewrite the source English text.
        </p>
      </div>
    </div>
  );
};

export const ComparisonLabPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    config,
    semanticMap,
    loadSemanticMap,
    lastSteerRequest,
    lastSteerResult,
    steerHistory,
    setActiveSteerRun,
    selectSteerResultFromHistory,
  } = useStudio();

  const concepts = config?.steering.concepts ?? CONTRACT_CONCEPTS;
  const minStrength = config?.steering.min_strength ?? CONTRACT_STEERING_BOUNDS.min_strength;
  const maxStrength = config?.steering.max_strength ?? CONTRACT_STEERING_BOUNDS.max_strength;
  const stepStrength = config?.steering.step ?? CONTRACT_STEERING_BOUNDS.step;

  const [text, setText] = useState(
    lastSteerRequest?.text ?? 'The presentation explained the results clearly and directly.'
  );
  const [concept, setConcept] = useState<ConceptId>(lastSteerRequest?.concept ?? 'formal_tone');
  const [strength, setStrength] = useState<number>(lastSteerRequest?.strength ?? 0.75);
  const [topK, setTopK] = useState<number>(
    lastSteerRequest?.top_k_neighbors === 10 ? 10 : 5
  );
  const [viewMode, setViewMode] = useState<SpaceViewMode>('2d');
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<ParsedApiError | null>(null);
  const [validationError, setValidationError] = useState<string | undefined>();

  useEffect(() => {
    void loadSemanticMap();
  }, [loadSemanticMap]);

  const neighborOverlapStats = useMemo(() => {
    if (!lastSteerResult) return null;
    const origItems = lastSteerResult.original.nearest_neighbors ?? [];
    const steeredItems = lastSteerResult.steered.nearest_neighbors ?? [];
    const origIds = new Set(origItems.map((n) => n.id));
    const steeredIds = new Set(steeredItems.map((n) => n.id));

    const retainedIds = new Set([...origIds].filter((id) => steeredIds.has(id)));
    const enteredIds = new Set([...steeredIds].filter((id) => !origIds.has(id)));
    const exitedIds = new Set([...origIds].filter((id) => !steeredIds.has(id)));
    const unionCount = new Set([...origIds, ...steeredIds]).size;
    const jaccard = unionCount > 0 ? retainedIds.size / unionCount : 1.0;

    return {
      origCount: origItems.length,
      steeredCount: steeredItems.length,
      retainedIds,
      enteredIds,
      exitedIds,
      jaccard,
    };
  }, [lastSteerResult]);

  const steeredNewNeighborIds = neighborOverlapStats?.enteredIds ?? new Set<string>();
  const originalExitedNeighborIds = neighborOverlapStats?.exitedIds ?? new Set<string>();
  const retainedNeighborIds = neighborOverlapStats?.retainedIds ?? new Set<string>();

  const estimatedWordCount = useMemo(() => {
    const trimmed = text.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }, [text]);

  const activeHistoryIndex = useMemo(() => {
    if (!lastSteerResult) return -1;
    return steerHistory.findIndex(
      (h) =>
        h.input_text === lastSteerResult.input_text &&
        h.concept === lastSteerResult.concept &&
        h.strength === lastSteerResult.strength
    );
  }, [steerHistory, lastSteerResult]);

  const executeComparison = async (override?: {
    text?: string;
    concept?: ConceptId;
    strength?: number;
    topK?: number;
  }) => {
    const targetText = (override?.text ?? text).trim();
    const targetConcept = override?.concept ?? concept;
    const targetStrength = override?.strength ?? strength;
    const targetTopK = override?.topK ?? topK;

    if (!targetText) {
      setValidationError('Enter a sentence to run an original vs. steered comparison.');
      return;
    }
    if (targetText.length > 1000) {
      setValidationError('Input text cannot exceed 1000 characters.');
      return;
    }

    setValidationError(undefined);
    setLoading(true);
    setApiError(null);

    const payload = {
      text: targetText,
      concept: targetConcept,
      strength: targetStrength,
      top_k_neighbors: targetTopK,
      include_embeddings: true,
    };

    try {
      const response = await steerEmbedding(payload);
      setActiveSteerRun(payload, response);
    } catch (err) {
      setApiError(parseApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void executeComparison();
  };

  return (
    <div className="space-y-6">
      {/* Plain-English Guide Banner */}
      <Reveal>
        <div className="rounded-2xl border border-border bg-background-surface px-5 py-3.5 flex items-start gap-3 text-xs text-text-secondary shadow-editorial-sm">
          <Info className="w-4 h-4 text-brand-slate shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong className="text-brand-navy font-semibold">
              Controlled baseline comparison:
            </strong>{' '}
            Compare the unsteered control (<code className="font-mono">λ = 0.0</code>, identical to
            the raw pretrained embedding) directly against a steered representation in 384D space.
            Verify whether retrieved nearest neighbors shift toward the target concept while holding
            semantic preservation high.
          </p>
        </div>
      </Reveal>

      {/* Run New Comparison Bar */}
      <Reveal delayMs={40}>
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <GitCompareArrows className="w-4 h-4 text-brand-slate" />
                Run or Select Comparison Experiment
              </CardTitle>
              <CardDescription>
                Execute POST /api/v1/steer to compare original and steered semantic representations
                side by side
              </CardDescription>
            </div>
            {steerHistory.length > 1 && (
              <div className="w-full sm:w-72">
                <Select
                  aria-label="Recent steering runs"
                  options={steerHistory.map((item, idx) => {
                    const snippet =
                      item.input_text.length > 26
                        ? `${item.input_text.slice(0, 26)}…`
                        : item.input_text;
                    return {
                      value: String(idx),
                      label: `${item.concept} (${formatSigned(item.strength, 2)}) — ${snippet}`,
                    };
                  })}
                  value={String(activeHistoryIndex >= 0 ? activeHistoryIndex : 0)}
                  onChange={(idx) => {
                    const chosen = steerHistory[Number(idx)];
                    if (chosen) {
                      selectSteerResultFromHistory(chosen);
                      setText(chosen.input_text);
                      setConcept(chosen.concept);
                      setStrength(chosen.strength);
                    }
                  }}
                />
              </div>
            )}
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
                <div className="lg:col-span-5">
                  <Input
                    label="Input Sentence"
                    placeholder="Enter text to compare original vs. steered representation…"
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      if (validationError) setValidationError(undefined);
                    }}
                    error={validationError}
                  />
                </div>
                <div className="lg:col-span-3">
                  <Select
                    label="Concept Direction"
                    options={concepts.map((c) => ({ value: c.id, label: c.label }))}
                    value={concept}
                    onChange={(val) => setConcept(val as ConceptId)}
                  />
                </div>
                <div className="lg:col-span-2">
                  <Select
                    label="Nearest Neighbors"
                    options={[
                      { value: '5', label: 'Top 5' },
                      { value: '10', label: 'Top 10' },
                    ]}
                    value={String(topK)}
                    onChange={(val) => setTopK(Number(val))}
                  />
                </div>
                <div className="lg:col-span-2 flex items-center gap-2">
                  <Button
                    type="submit"
                    loading={loading}
                    leftIcon={<Play className="w-4 h-4" />}
                    className="w-full"
                  >
                    Compare
                  </Button>
                </div>
              </div>

              {estimatedWordCount > 180 && (
                <div className="rounded-xl border border-amber-300 bg-amber-50/70 px-3 py-2 flex items-start gap-2 text-xs text-amber-900">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
                  <span>
                    <strong>Truncation advisory:</strong> Input has {estimatedWordCount} words;{' '}
                    <code className="font-mono">all-MiniLM-L6-v2</code> truncates past{' '}
                    {config?.model.max_sequence_length ?? 256} tokens.
                  </span>
                </div>
              )}

              <Slider
                label="Comparison Steering Strength (λ)"
                value={strength}
                min={minStrength}
                max={maxStrength}
                step={stepStrength}
                onChange={setStrength}
              />
            </form>
          </CardContent>
        </Card>
      </Reveal>

      {loading ? (
        <LoadingState
          title="Running Side-by-Side Comparison…"
          description="Generating original and steered embeddings, projections, and neighbor sets."
        />
      ) : apiError ? (
        <ErrorAlert error={apiError} onRetry={() => void executeComparison()} />
      ) : !lastSteerResult ? (
        <EmptyState
          icon={<GitCompareArrows className="w-5 h-5" />}
          title="No Comparison Loaded"
          description="Run a comparison above or execute a steering experiment on the Vector Steering page to compare original and steered embeddings side by side."
        />
      ) : (
        <>
          {/* Movement & Similarity Summary Strip */}
          <Reveal delayMs={60}>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Card>
                <CardContent className="p-4">
                  <div className="text-[11px] text-text-muted">Semantic Preservation</div>
                  <div className="mt-1 text-base font-mono font-semibold text-emerald-700">
                    {formatPercent(lastSteerResult.preservation.semantic_preservation_score, 1)}
                  </div>
                  <div className="text-[11px] font-mono text-text-muted">
                    cos={formatNumber(lastSteerResult.preservation.cosine_similarity, 4)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="text-[11px] text-text-muted">384D Distance</div>
                  <div className="mt-1 text-base font-mono font-semibold text-brand-navy">
                    {formatNumber(lastSteerResult.movement.euclidean_distance_384d, 4)}
                  </div>
                  <div className="text-[11px] font-mono text-text-muted">
                    cos dist={formatNumber(lastSteerResult.movement.cosine_distance_384d, 4)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="text-[11px] text-text-muted">Angular Shift</div>
                  <div className="mt-1 text-base font-mono font-semibold text-brand-teal">
                    {formatNumber(lastSteerResult.movement.angle_degrees, 2)}°
                  </div>
                  <div className="text-[11px] font-mono text-text-muted">
                    {formatNumber(lastSteerResult.movement.angle_radians, 4)} rad
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="text-[11px] text-text-muted">Concept Shift (Δ)</div>
                  <div className="mt-1 text-base font-mono font-semibold text-brand-slate">
                    {formatSigned(lastSteerResult.concept_metrics.delta, 4)}
                  </div>
                  <div className="text-[11px] font-mono text-text-muted">
                    target={formatNumber(lastSteerResult.concept_metrics.target_alignment, 4)}
                  </div>
                </CardContent>
              </Card>

              <Card className="col-span-2 md:col-span-1">
                <CardContent className="p-4">
                  <div className="text-[11px] text-text-muted">UMAP Displacement</div>
                  <div className="mt-1 text-base font-mono font-semibold text-amber-700">
                    {formatNumber(
                      lastSteerResult.movement.coordinate_shift.projection_displacement,
                      3
                    )}
                  </div>
                  <div className="text-[11px] font-mono text-text-muted">
                    drift={formatNumber(lastSteerResult.preservation.magnitude_drift, 4)}
                  </div>
                </CardContent>
              </Card>
            </div>
          </Reveal>

          {/* Geometric Vector Movement Diagram & Expandable Researcher Numerics */}
          <Reveal delayMs={70}>
            <Card>
              <CardHeader>
                <div>
                  <CardTitle className="text-brand-navy">
                    Before &amp; After Vector Displacement Overview
                  </CardTitle>
                  <CardDescription>
                    Real backend geometry along{' '}
                    {formatConceptLabel(lastSteerResult.concept, concepts)} at λ ={' '}
                    {formatSigned(lastSteerResult.strength, 2)}
                  </CardDescription>
                </div>
                {(!lastSteerResult.original.embedding || !lastSteerResult.steered.embedding) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      void executeComparison({
                        text: lastSteerResult.input_text,
                        concept: lastSteerResult.concept,
                        strength: lastSteerResult.strength,
                      })
                    }
                  >
                    Fetch Full 384D Vectors
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <VectorMovementDiagram
                  angleDegrees={lastSteerResult.movement.angle_degrees}
                  cosineSimilarity={lastSteerResult.preservation.cosine_similarity}
                  euclideanDistance={lastSteerResult.movement.euclidean_distance_384d}
                  strength={lastSteerResult.strength}
                  conceptLabel={formatConceptLabel(lastSteerResult.concept, concepts)}
                />

                <details className="group rounded-xl border border-border-subtle bg-background/80 px-4 py-3 text-xs text-text-secondary">
                  <summary className="cursor-pointer select-none font-medium text-brand-navy flex items-center justify-between list-none">
                    <span>Researcher Numerical &amp; 384D Vector Details</span>
                    <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="mt-3 pt-3 border-t border-border-subtle space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-[11px]">
                      <div>
                        <span className="text-text-muted block">384D Euclid Dist</span>
                        <span className="text-brand-navy font-semibold">
                          {formatNumber(lastSteerResult.movement.euclidean_distance_384d, 6)}
                        </span>
                      </div>
                      <div>
                        <span className="text-text-muted block">Cosine Distance</span>
                        <span className="text-brand-navy font-semibold">
                          {formatNumber(lastSteerResult.movement.cosine_distance_384d, 6)}
                        </span>
                      </div>
                      <div>
                        <span className="text-text-muted block">Norm Magnitude Drift</span>
                        <span className="text-brand-navy font-semibold">
                          {formatNumber(lastSteerResult.preservation.magnitude_drift, 6)}
                        </span>
                      </div>
                      <div>
                        <span className="text-text-muted block">Angle (rad)</span>
                        <span className="text-brand-navy font-semibold">
                          {formatNumber(lastSteerResult.movement.angle_radians, 6)}
                        </span>
                      </div>
                    </div>
                    <div className="font-mono text-[11px] text-text-muted">
                      UMAP 3D Δ: dx={formatSigned(lastSteerResult.movement.coordinate_shift.dx, 4)},{' '}
                      dy={formatSigned(lastSteerResult.movement.coordinate_shift.dy, 4)}, dz=
                      {formatSigned(lastSteerResult.movement.coordinate_shift.dz, 4)}
                    </div>
                    <div className="space-y-1">
                      <div className="text-[11px] font-medium text-text-muted">
                        384D Trajectory Vector (E&prime; &minus; E) Slice
                      </div>
                      <pre className="rounded-lg border border-border bg-background-surface p-2.5 text-[11px] font-mono text-text-secondary overflow-x-auto">
                        {formatEmbeddingSlice(lastSteerResult.movement.trajectory_vector_384d, 8)}
                      </pre>
                    </div>
                  </div>
                </details>
              </CardContent>
            </Card>
          </Reveal>

          {/* Nearest Neighbor Stability Banner */}
          {neighborOverlapStats && (
            <Reveal delayMs={75}>
              <div className="rounded-2xl border border-border bg-background-surface p-4 flex flex-wrap items-center justify-between gap-3 text-xs shadow-editorial-sm">
                <div className="space-y-1">
                  <div className="font-semibold text-brand-navy">
                    384D Nearest Neighbor Explorer (vs. {semanticMap?.total_points ?? 'reference'}
                    -Sentence Corpus)
                  </div>
                  <p className="text-text-muted">
                    Ranked strictly by 384D cosine similarity (never 2D/3D UMAP visual proximity).
                    Hover or inspect any neighbor card below to compare exact distances.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                  <Badge variant="cyan">
                    Jaccard Overlap: {formatPercent(neighborOverlapStats.jaccard, 1)}
                  </Badge>
                  <Badge variant="neutral">
                    Retained: {neighborOverlapStats.retainedIds.size}/{neighborOverlapStats.origCount}
                  </Badge>
                  <Badge variant="emerald">Entered: +{neighborOverlapStats.enteredIds.size}</Badge>
                  <Badge variant="rose">Left: -{neighborOverlapStats.exitedIds.size}</Badge>
                </div>
              </div>
            </Reveal>
          )}

          {/* Side-by-Side Comparison Columns */}
          <Reveal delayMs={80}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Original Representation */}
              <Card className="border-slate-300/80">
                <CardHeader className="bg-slate-50/90">
                  <div>
                    <CardTitle className="text-brand-navy flex items-center gap-2">
                      Original Embedding State
                    </CardTitle>
                    <CardDescription>Unsteered baseline representation (λ = 0.0)</CardDescription>
                  </div>
                  <Badge variant="cyan">Original</Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="text-[11px] font-medium text-text-muted mb-1">
                      Original Sentence
                    </div>
                    <div className="rounded-xl border border-border bg-background/80 p-3 text-sm text-text-primary leading-relaxed">
                      {lastSteerResult.input_text}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-xl border border-border bg-background/60 p-3">
                      <div className="text-text-muted">UMAP Coordinates</div>
                      <div className="font-mono font-medium text-brand-navy mt-1">
                        {formatCoordinates(lastSteerResult.original.coordinates, 3)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border bg-background/60 p-3">
                      <div className="text-text-muted">Concept Alignment</div>
                      <div className="font-mono font-semibold text-brand-slate mt-1">
                        {formatNumber(lastSteerResult.original.concept_score, 4)}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] font-medium text-text-muted mb-1">
                      Original 384D Vector Slice
                    </div>
                    <pre className="rounded-xl border border-border bg-background p-2.5 text-[11px] font-mono text-text-secondary overflow-x-auto">
                      {formatEmbeddingSlice(lastSteerResult.original.embedding, 6)}
                    </pre>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-brand-navy">
                      Nearest Neighbors (Original 384D)
                    </div>
                    <NeighborList
                      items={lastSteerResult.original.nearest_neighbors}
                      accent="cyan"
                      highlightIds={originalExitedNeighborIds}
                      highlightLabel="Left Top-K"
                      highlightVariant="rose"
                      retainedIds={retainedNeighborIds}
                      onSelectForSteering={(item) =>
                        navigate('/steering', { state: { prefillText: item.text } })
                      }
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Steered Representation */}
              <Card className="border-teal-300/80">
                <CardHeader className="bg-teal-50/70">
                  <div>
                    <CardTitle className="text-brand-teal flex items-center gap-2">
                      <Sparkles className="w-4 h-4" />
                      Steered Embedding State
                    </CardTitle>
                    <CardDescription>
                      Shifted along {formatConceptLabel(lastSteerResult.concept, concepts)} at λ ={' '}
                      {formatSigned(lastSteerResult.strength, 2)}
                    </CardDescription>
                  </div>
                  <Badge variant="violet">Steered</Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="text-[11px] font-medium text-text-muted mb-1">
                      Steered Semantic Representation
                    </div>
                    <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-3 text-xs text-text-secondary leading-relaxed space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2 text-brand-navy font-medium">
                        <span>&ldquo;{lastSteerResult.input_text}&rdquo;</span>
                        <ArrowRight className="w-3.5 h-3.5 text-brand-teal shrink-0" />
                        <span className="text-brand-teal font-mono">
                          {lastSteerResult.concept} ({formatSigned(lastSteerResult.strength, 2)})
                        </span>
                      </div>
                      <p className="text-[11px] text-text-muted">
                        Top semantic proxy in corpus:{' '}
                        <span className="text-text-primary font-medium">
                          {lastSteerResult.steered.nearest_neighbors[0]?.text ??
                            'No corpus proxy returned by backend.'}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-xl border border-border bg-background/60 p-3">
                      <div className="text-text-muted">UMAP Coordinates</div>
                      <div className="font-mono font-medium text-brand-navy mt-1">
                        {formatCoordinates(lastSteerResult.steered.coordinates, 3)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border bg-background/60 p-3">
                      <div className="text-text-muted">Concept Alignment</div>
                      <div className="font-mono font-semibold text-brand-teal mt-1">
                        {formatNumber(lastSteerResult.steered.concept_score, 4)}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] font-medium text-text-muted mb-1">
                      Steered 384D Vector Slice
                    </div>
                    <pre className="rounded-xl border border-border bg-background p-2.5 text-[11px] font-mono text-text-secondary overflow-x-auto">
                      {formatEmbeddingSlice(lastSteerResult.steered.embedding, 6)}
                    </pre>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-brand-teal">
                      Nearest Neighbors (Steered 384D)
                    </div>
                    <NeighborList
                      items={lastSteerResult.steered.nearest_neighbors}
                      accent="violet"
                      highlightIds={steeredNewNeighborIds}
                      highlightLabel="Entered Top-K"
                      highlightVariant="emerald"
                      retainedIds={retainedNeighborIds}
                      onSelectForSteering={(item) =>
                        navigate('/steering', { state: { prefillText: item.text } })
                      }
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </Reveal>

          {/* Semantic Space & Similarity Comparison Plots */}
          <Reveal delayMs={100}>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Semantic Space Displacement</CardTitle>
                    <CardDescription>
                      Trajectory vector and neighborhood shift in UMAP space
                    </CardDescription>
                  </div>
                  <ViewModeToggle mode={viewMode} onChange={setViewMode} />
                </CardHeader>
                <CardContent>
                  <SemanticSpacePlot
                    mode={viewMode}
                    semanticMap={semanticMap}
                    originalPoint={{
                      label: 'Original',
                      text: lastSteerResult.input_text,
                      coordinates: lastSteerResult.original.coordinates,
                      conceptScore: lastSteerResult.original.concept_score,
                    }}
                    steeredPoint={{
                      label: `Steered (λ=${formatSigned(lastSteerResult.strength, 2)})`,
                      text: `Steered along ${lastSteerResult.concept}`,
                      coordinates: lastSteerResult.steered.coordinates,
                      conceptScore: lastSteerResult.steered.concept_score,
                    }}
                    originalNeighbors={lastSteerResult.original.nearest_neighbors}
                    steeredNeighbors={lastSteerResult.steered.nearest_neighbors}
                    heightClassName="h-[360px]"
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Nearest-Neighbor Similarity Comparison</CardTitle>
                    <CardDescription>
                      Cosine similarity distribution by rank in 384D embedding space
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <NeighborSimilarityChart
                    originalNeighbors={lastSteerResult.original.nearest_neighbors}
                    steeredNeighbors={lastSteerResult.steered.nearest_neighbors}
                    heightClassName="h-[360px]"
                  />
                </CardContent>
              </Card>
            </div>
          </Reveal>

          {/* Cross-Feature Workflow Navigation */}
          <Reveal delayMs={110}>
            <div className="rounded-2xl border border-border bg-background-surface px-5 py-4 flex flex-wrap items-center justify-between gap-3 shadow-editorial-sm">
              <div className="text-xs text-text-secondary">
                <strong className="text-brand-navy">Continue scientific validation:</strong>{' '}
                Sweep this exact sentence across multiple strengths in the Evaluation Lab or inspect
                the global corpus map.
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
                <Link to="/evaluation">
                  <Button size="sm" rightIcon={<BarChart3 className="w-3.5 h-3.5" />}>
                    Open Evaluation Lab
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
