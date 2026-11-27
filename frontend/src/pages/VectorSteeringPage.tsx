import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  GitCompareArrows,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { NeighborList } from '@/components/NeighborList';
import { ViewModeToggle } from '@/components/ViewModeToggle';
import { SemanticSpacePlot, type SpaceViewMode } from '@/components/charts';
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
  LoadingState,
  Select,
  Slider,
  Textarea,
  Tooltip,
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

const SAMPLE_PROMPTS = [
  'The code runs fast and without any problems.',
  'The meeting went okay, we talked about next week.',
  'Please send me the report when you get a chance.',
];

export const VectorSteeringPage: React.FC = () => {
  const {
    config,
    configError,
    semanticMap,
    loadSemanticMap,
    lastSteerRequest,
    lastSteerResult,
    setActiveSteerRun,
    clearActiveSteerRun,
  } = useStudio();

  const concepts = config?.steering.concepts ?? CONTRACT_CONCEPTS;
  const minStrength = config?.steering.min_strength ?? CONTRACT_STEERING_BOUNDS.min_strength;
  const maxStrength = config?.steering.max_strength ?? CONTRACT_STEERING_BOUNDS.max_strength;
  const stepStrength = config?.steering.step ?? CONTRACT_STEERING_BOUNDS.step;
  const defaultStrength = config?.steering.default_strength ?? CONTRACT_STEERING_BOUNDS.default_strength;

  const [text, setText] = useState<string>(lastSteerRequest?.text ?? SAMPLE_PROMPTS[0]);
  const [concept, setConcept] = useState<ConceptId>(lastSteerRequest?.concept ?? 'technical_tone');
  const [strength, setStrength] = useState<number>(lastSteerRequest?.strength ?? 0.5);
  const [topK, setTopK] = useState<number>(lastSteerRequest?.top_k_neighbors ?? 5);
  const [includeEmbeddings, setIncludeEmbeddings] = useState<boolean>(
    lastSteerRequest?.include_embeddings ?? true
  );

  const [viewMode, setViewMode] = useState<SpaceViewMode>('2d');
  const [showCorpusOverlay, setShowCorpusOverlay] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [apiError, setApiError] = useState<ParsedApiError | null>(null);
  const [validationError, setValidationError] = useState<string | undefined>();

  useEffect(() => {
    void loadSemanticMap();
  }, [loadSemanticMap]);

  const selectedConceptMeta = useMemo(
    () => concepts.find((c) => c.id === concept) ?? concepts[0],
    [concepts, concept]
  );

  const steeredNewNeighborIds = useMemo(() => {
    if (!lastSteerResult) return new Set<string>();
    const origIds = new Set(lastSteerResult.original.nearest_neighbors.map((n) => n.id));
    return new Set(
      lastSteerResult.steered.nearest_neighbors
        .filter((n) => !origIds.has(n.id))
        .map((n) => n.id)
    );
  }, [lastSteerResult]);

  const executeSteering = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setValidationError('Please enter input text (1–1000 characters).');
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
      top_k_neighbors: topK,
      include_embeddings: includeEmbeddings,
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
    void executeSteering();
  };

  const handleReset = () => {
    setText(SAMPLE_PROMPTS[0]);
    setConcept('technical_tone');
    setStrength(defaultStrength);
    setTopK(5);
    setIncludeEmbeddings(true);
    setValidationError(undefined);
    setApiError(null);
    clearActiveSteerRun();
  };

  return (
    <div className="space-y-6">
      {configError && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-2">
          <span>
            <strong className="font-semibold">Contract Parameter Mode:</strong>{' '}
            <code className="font-mono">GET /api/v1/config</code> is currently unavailable (
            {configError.code}). Form controls use schema defaults from{' '}
            <code className="font-mono">contracts/api-contract.md</code>.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left Control Workbench */}
        <Card className="xl:col-span-5">
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-accent-violet" />
                Steering Controls
              </CardTitle>
              <CardDescription>
                POST /api/v1/steer &bull; 384D concept manipulation
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Textarea
                  label="Input Sentence"
                  placeholder="Enter a sentence to embed and steer along a concept vector…"
                  rows={3}
                  maxLength={1000}
                  showCount
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    if (validationError) setValidationError(undefined);
                  }}
                  error={validationError}
                />
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-text-muted">Examples:</span>
                  {SAMPLE_PROMPTS.map((sample, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setText(sample);
                        setValidationError(undefined);
                      }}
                      className="text-[11px] px-2 py-0.5 rounded-md border border-border bg-background/60 text-text-secondary hover:text-text-primary hover:border-accent-cyan/40 transition-colors"
                    >
                      Sample {idx + 1}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Select
                  label="Semantic Concept"
                  options={concepts.map((c) => ({ value: c.id, label: c.label }))}
                  value={concept}
                  onChange={(val) => setConcept(val as ConceptId)}
                />
                {selectedConceptMeta && (
                  <div className="rounded-lg border border-border/80 bg-background/60 p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-text-primary">
                        {selectedConceptMeta.label}
                      </span>
                      <Badge variant="violet">{selectedConceptMeta.id}</Badge>
                    </div>
                    <p className="text-[11px] text-text-muted leading-relaxed">
                      {selectedConceptMeta.description}
                    </p>
                  </div>
                )}
              </div>

              <Slider
                label="Steering Strength (λ)"
                value={strength}
                min={minStrength}
                max={maxStrength}
                step={stepStrength}
                onChange={setStrength}
                negativeLabel={selectedConceptMeta?.negative_label}
                positiveLabel={selectedConceptMeta?.positive_label}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <Select
                  label="Top-K Nearest Neighbors"
                  options={[
                    { value: '3', label: 'Top 3 Neighbors' },
                    { value: '5', label: 'Top 5 Neighbors' },
                    { value: '10', label: 'Top 10 Neighbors' },
                    { value: '15', label: 'Top 15 Neighbors' },
                  ]}
                  value={String(topK)}
                  onChange={(val) => setTopK(Number(val))}
                />
                <label className="flex items-center gap-2 sm:pt-6 text-xs text-text-secondary cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeEmbeddings}
                    onChange={(e) => setIncludeEmbeddings(e.target.checked)}
                    className="rounded border-border bg-background text-accent-cyan focus:ring-accent-cyan/40"
                  />
                  <span>Include 384D embeddings</span>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border/70">
                <Button
                  type="submit"
                  loading={loading}
                  leftIcon={<Sparkles className="w-4 h-4" />}
                  className="flex-1"
                >
                  Apply Steering
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleReset}
                  leftIcon={<RotateCcw className="w-4 h-4" />}
                >
                  Reset
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Right Visualization & Primary Metrics */}
        <div className="xl:col-span-7 space-y-6">
          {loading ? (
            <LoadingState
              title="Computing Vector Steering on Backend…"
              description="Running all-MiniLM-L6-v2 inference, 384D steering, and UMAP transform."
            />
          ) : apiError ? (
            <ErrorAlert error={apiError} onRetry={() => void executeSteering()} />
          ) : !lastSteerResult ? (
            <EmptyState
              icon={<SlidersHorizontal className="w-5 h-5" />}
              title="No Steering Results Yet"
              description="Enter a sentence, select a semantic concept, set steering strength λ ∈ [-1.0, +1.0], and click Apply Steering to observe backend results."
            />
          ) : (
            <>
              {/* Active Experiment Summary Header */}
              <Card className="border-sky-500/25">
                <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="cyan">
                        {formatConceptLabel(lastSteerResult.concept, concepts)}
                      </Badge>
                      <Badge variant={lastSteerResult.strength === 0 ? 'neutral' : 'violet'}>
                        Strength λ = {formatSigned(lastSteerResult.strength, 2)}
                      </Badge>
                      {lastSteerResult.strength === 0 && (
                        <Badge variant="emerald">Neutral Baseline (Zero Movement)</Badge>
                      )}
                    </div>
                    <p className="text-xs text-text-secondary truncate" title={lastSteerResult.input_text}>
                      Original: &ldquo;{lastSteerResult.input_text}&rdquo;
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <Link to="/comparison">
                      <Button
                        variant="secondary"
                        size="sm"
                        leftIcon={<GitCompareArrows className="w-3.5 h-3.5" />}
                        rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
                      >
                        Compare
                      </Button>
                    </Link>
                    <Link to="/evaluation">
                      <Button
                        variant="outline"
                        size="sm"
                        leftIcon={<BarChart3 className="w-3.5 h-3.5" />}
                      >
                        Evaluate
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>

              {/* Vector Movement Plot */}
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Vector Movement Visualization</CardTitle>
                    <CardDescription>
                      Original (cyan) vs. Steered (violet) position in consistent UMAP projection
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {semanticMap && (
                      <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={showCorpusOverlay}
                          onChange={(e) => setShowCorpusOverlay(e.target.checked)}
                          className="rounded border-border bg-background text-accent-cyan focus:ring-accent-cyan/40"
                        />
                        <span>Corpus backdrop</span>
                      </label>
                    )}
                    <ViewModeToggle mode={viewMode} onChange={setViewMode} />
                  </div>
                </CardHeader>
                <CardContent>
                  <SemanticSpacePlot
                    mode={viewMode}
                    semanticMap={showCorpusOverlay ? semanticMap : null}
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
                    heightClassName="h-[420px]"
                  />
                </CardContent>
              </Card>

              {/* Key Backend Metrics Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between text-[11px] text-text-muted">
                      <span>Concept Delta</span>
                      <Tooltip content="Change in projection onto the target concept direction: steered_score - original_score." />
                    </div>
                    <div className="mt-1.5 text-lg font-mono font-semibold text-accent-cyan tabular-nums">
                      {formatSigned(lastSteerResult.concept_metrics.delta, 4)}
                    </div>
                    <div className="text-[11px] font-mono text-text-muted mt-1">
                      {formatNumber(lastSteerResult.concept_metrics.original_score, 3)} →{' '}
                      {formatNumber(lastSteerResult.concept_metrics.steered_score, 3)}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between text-[11px] text-text-muted">
                      <span>Preservation</span>
                      <Tooltip content="Cosine similarity between original and steered 384D embeddings (1.0 = identical meaning)." />
                    </div>
                    <div className="mt-1.5 text-lg font-mono font-semibold text-accent-emerald tabular-nums">
                      {formatPercent(lastSteerResult.preservation.semantic_preservation_score, 1)}
                    </div>
                    <div className="text-[11px] font-mono text-text-muted mt-1">
                      cos: {formatNumber(lastSteerResult.preservation.cosine_similarity, 4)}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between text-[11px] text-text-muted">
                      <span>384D Displacement</span>
                      <Tooltip content="Euclidean distance and angular shift between original and steered vectors in 384D space." />
                    </div>
                    <div className="mt-1.5 text-lg font-mono font-semibold text-purple-300 tabular-nums">
                      {formatNumber(lastSteerResult.movement.euclidean_distance_384d, 4)}
                    </div>
                    <div className="text-[11px] font-mono text-text-muted mt-1">
                      angle: {formatNumber(lastSteerResult.movement.angle_degrees, 2)}°
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between text-[11px] text-text-muted">
                      <span>UMAP Shift</span>
                      <Tooltip content="Euclidean displacement in projected UMAP visualization coordinates." />
                    </div>
                    <div className="mt-1.5 text-lg font-mono font-semibold text-amber-300 tabular-nums">
                      {formatNumber(lastSteerResult.movement.coordinate_shift.projection_displacement, 3)}
                    </div>
                    <div className="text-[11px] font-mono text-text-muted mt-1">
                      dx={formatSigned(lastSteerResult.movement.coordinate_shift.dx, 2)}, dy=
                      {formatSigned(lastSteerResult.movement.coordinate_shift.dy, 2)}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Embedding & Nearest Neighbor Detail Section */}
      {lastSteerResult && !loading && !apiError && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Original Vector & Neighbors */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="text-accent-cyan">Original Representation</CardTitle>
                <CardDescription>
                  Coords {formatCoordinates(lastSteerResult.original.coordinates, 3)} &bull; Concept
                  Score {formatNumber(lastSteerResult.original.concept_score, 4)}
                </CardDescription>
              </div>
              <Badge variant="cyan">Baseline</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-text-secondary">384D Embedding Preview</div>
                <pre className="rounded-lg border border-border bg-background p-3 text-[11px] font-mono text-text-muted overflow-x-auto">
                  {formatEmbeddingSlice(lastSteerResult.original.embedding, 8)}
                </pre>
              </div>
              <div className="space-y-2">
                <div className="text-xs font-semibold text-text-primary">
                  Original Nearest Neighbors
                </div>
                <NeighborList items={lastSteerResult.original.nearest_neighbors} accent="cyan" />
              </div>
            </CardContent>
          </Card>

          {/* Steered Vector & Neighbors */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="text-purple-300">Steered Representation</CardTitle>
                <CardDescription>
                  Coords {formatCoordinates(lastSteerResult.steered.coordinates, 3)} &bull; Concept
                  Score {formatNumber(lastSteerResult.steered.concept_score, 4)}
                </CardDescription>
              </div>
              <Badge variant="violet">λ = {formatSigned(lastSteerResult.strength, 2)}</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-text-secondary">
                  384D Steered Embedding Preview
                </div>
                <pre className="rounded-lg border border-border bg-background p-3 text-[11px] font-mono text-text-muted overflow-x-auto">
                  {formatEmbeddingSlice(lastSteerResult.steered.embedding, 8)}
                </pre>
              </div>
              <div className="space-y-2">
                <div className="text-xs font-semibold text-text-primary">
                  Steered Nearest Neighbors
                </div>
                <NeighborList
                  items={lastSteerResult.steered.nearest_neighbors}
                  accent="violet"
                  highlightIds={steeredNewNeighborIds}
                  highlightLabel="Shifted In"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
