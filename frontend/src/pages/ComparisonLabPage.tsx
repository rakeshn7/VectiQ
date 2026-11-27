import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, GitCompareArrows, Play, Sparkles } from 'lucide-react';
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

export const ComparisonLabPage: React.FC = () => {
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
  const [viewMode, setViewMode] = useState<SpaceViewMode>('2d');
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<ParsedApiError | null>(null);
  const [validationError, setValidationError] = useState<string | undefined>();

  useEffect(() => {
    void loadSemanticMap();
  }, [loadSemanticMap]);

  const steeredNewNeighborIds = useMemo(() => {
    if (!lastSteerResult) return new Set<string>();
    const origIds = new Set(lastSteerResult.original.nearest_neighbors.map((n) => n.id));
    return new Set(
      lastSteerResult.steered.nearest_neighbors
        .filter((n) => !origIds.has(n.id))
        .map((n) => n.id)
    );
  }, [lastSteerResult]);

  const activeHistoryIndex = useMemo(() => {
    if (!lastSteerResult) return -1;
    return steerHistory.findIndex(
      (h) =>
        h.input_text === lastSteerResult.input_text &&
        h.concept === lastSteerResult.concept &&
        h.strength === lastSteerResult.strength
    );
  }, [steerHistory, lastSteerResult]);

  const executeComparison = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setValidationError('Enter a sentence to run an original vs. steered comparison.');
      return;
    }
    if (trimmed.length > 1000) {
      setValidationError('Input text cannot exceed 1000 characters.');
      return;
    }

    setValidationError(undefined);
    setLoading(true);
    setApiError(null);

    const payload = {
      text: trimmed,
      concept,
      strength,
      top_k_neighbors: 5,
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
      {/* Run New Comparison Bar */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <GitCompareArrows className="w-4 h-4 text-accent-cyan" />
              Run or Select Comparison Experiment
            </CardTitle>
            <CardDescription>
              Execute POST /api/v1/steer to compare original and steered semantic representations side
              by side
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
              <div className="lg:col-span-6">
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
              <div className="lg:col-span-3 flex items-center gap-2">
                <Button
                  type="submit"
                  loading={loading}
                  leftIcon={<Play className="w-4 h-4" />}
                  className="w-full"
                >
                  Run Comparison
                </Button>
              </div>
            </div>

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
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card>
              <CardContent className="p-4">
                <div className="text-[11px] text-text-muted">Semantic Preservation</div>
                <div className="mt-1 text-base font-mono font-semibold text-accent-emerald">
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
                <div className="mt-1 text-base font-mono font-semibold text-accent-cyan">
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
                <div className="mt-1 text-base font-mono font-semibold text-purple-300">
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
                <div className="mt-1 text-base font-mono font-semibold text-sky-300">
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
                <div className="mt-1 text-base font-mono font-semibold text-amber-300">
                  {formatNumber(lastSteerResult.movement.coordinate_shift.projection_displacement, 3)}
                </div>
                <div className="text-[11px] font-mono text-text-muted">
                  drift={formatNumber(lastSteerResult.preservation.magnitude_drift, 4)}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Side-by-Side Comparison Columns */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Original Representation */}
            <Card className="border-sky-500/30">
              <CardHeader className="bg-sky-500/5">
                <div>
                  <CardTitle className="text-accent-cyan flex items-center gap-2">
                    Original Embedding State
                  </CardTitle>
                  <CardDescription>Unsteered baseline representation (λ = 0.0)</CardDescription>
                </div>
                <Badge variant="cyan">Original</Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="text-[11px] font-medium text-text-muted mb-1">Original Sentence</div>
                  <div className="rounded-lg border border-border bg-background/70 p-3 text-sm text-text-primary leading-relaxed">
                    {lastSteerResult.input_text}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-lg border border-border bg-background/60 p-3">
                    <div className="text-text-muted">UMAP Coordinates</div>
                    <div className="font-mono text-text-primary mt-1">
                      {formatCoordinates(lastSteerResult.original.coordinates, 3)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-background/60 p-3">
                    <div className="text-text-muted">Concept Alignment</div>
                    <div className="font-mono text-accent-cyan mt-1">
                      {formatNumber(lastSteerResult.original.concept_score, 4)}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-medium text-text-muted mb-1">
                    Original 384D Vector Slice
                  </div>
                  <pre className="rounded-lg border border-border bg-background p-2.5 text-[11px] font-mono text-text-muted overflow-x-auto">
                    {formatEmbeddingSlice(lastSteerResult.original.embedding, 6)}
                  </pre>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-text-primary">
                    Nearest Neighbors (Original)
                  </div>
                  <NeighborList items={lastSteerResult.original.nearest_neighbors} accent="cyan" />
                </div>
              </CardContent>
            </Card>

            {/* Steered Representation */}
            <Card className="border-purple-500/30">
              <CardHeader className="bg-purple-500/5">
                <div>
                  <CardTitle className="text-purple-300 flex items-center gap-2">
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
                  <div className="rounded-lg border border-purple-500/25 bg-background/70 p-3 text-xs text-text-secondary leading-relaxed space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2 text-text-primary font-medium">
                      <span>&ldquo;{lastSteerResult.input_text}&rdquo;</span>
                      <ArrowRight className="w-3.5 h-3.5 text-purple-300 shrink-0" />
                      <span className="text-purple-300 font-mono">
                        {lastSteerResult.concept} ({formatSigned(lastSteerResult.strength, 2)})
                      </span>
                    </div>
                    <p className="text-[11px] text-text-muted">
                      Top semantic proxy in corpus:{' '}
                      <span className="text-text-primary">
                        {lastSteerResult.steered.nearest_neighbors[0]?.text ??
                          'No corpus proxy returned by backend.'}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-lg border border-border bg-background/60 p-3">
                    <div className="text-text-muted">UMAP Coordinates</div>
                    <div className="font-mono text-text-primary mt-1">
                      {formatCoordinates(lastSteerResult.steered.coordinates, 3)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-background/60 p-3">
                    <div className="text-text-muted">Concept Alignment</div>
                    <div className="font-mono text-purple-300 mt-1">
                      {formatNumber(lastSteerResult.steered.concept_score, 4)}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-medium text-text-muted mb-1">
                    Steered 384D Vector Slice
                  </div>
                  <pre className="rounded-lg border border-border bg-background p-2.5 text-[11px] font-mono text-text-muted overflow-x-auto">
                    {formatEmbeddingSlice(lastSteerResult.steered.embedding, 6)}
                  </pre>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-text-primary">
                    Nearest Neighbors (Steered)
                  </div>
                  <NeighborList
                    items={lastSteerResult.steered.nearest_neighbors}
                    accent="violet"
                    highlightIds={steeredNewNeighborIds}
                    highlightLabel="Entered Top-K"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Semantic Space & Similarity Comparison Plots */}
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
        </>
      )}
    </div>
  );
};
