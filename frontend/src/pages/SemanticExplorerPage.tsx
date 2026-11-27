import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Compass, Info, RefreshCw, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react';
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
  Input,
  LoadingState,
  Reveal,
  Select,
  Textarea,
} from '@/components/ui';
import { useStudio } from '@/hooks/useStudio';
import { parseApiError, steerEmbedding, type ParsedApiError } from '@/services';
import type { ConceptId, SemanticMapPoint, SteerResponse } from '@/types/api';
import {
  CONTRACT_CONCEPTS,
  formatConceptLabel,
  formatCoordinates,
  formatEmbeddingSlice,
  formatNumber,
} from '@/utils/format';

export const SemanticExplorerPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    config,
    semanticMap,
    semanticMapLoading,
    semanticMapError,
    loadSemanticMap,
  } = useStudio();

  const [viewMode, setViewMode] = useState<SpaceViewMode>('2d');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [selectedPointNeighbors, setSelectedPointNeighbors] = useState<SteerResponse | null>(null);
  const [selectedNeighborsLoading, setSelectedNeighborsLoading] = useState(false);
  const [selectedNeighborsError, setSelectedNeighborsError] = useState<ParsedApiError | null>(null);

  // Custom sentence exploration via POST /api/v1/steer with strength = 0.0
  const [customText, setCustomText] = useState('');
  const [customConcept, setCustomConcept] = useState<ConceptId>('positive_sentiment');
  const [includeEmbeddings, setIncludeEmbeddings] = useState(true);
  const [customLoading, setCustomLoading] = useState(false);
  const [customError, setCustomError] = useState<ParsedApiError | null>(null);
  const [customValidationError, setCustomValidationError] = useState<string | undefined>();
  const [projectedTextResult, setProjectedTextResult] = useState<SteerResponse | null>(null);

  useEffect(() => {
    void loadSemanticMap();
  }, [loadSemanticMap]);

  const conceptOptions = useMemo(() => {
    const concepts = config?.steering.concepts ?? CONTRACT_CONCEPTS;
    return concepts.map((c) => ({ value: c.id, label: c.label }));
  }, [config]);

  const categoryOptions = useMemo(() => {
    const base = [{ value: 'all', label: 'All Semantic Clusters' }];
    if (!semanticMap) return base;
    return [
      ...base,
      ...semanticMap.clusters.map((c) => ({
        value: c.id,
        label: `${c.label} (${c.point_count})`,
      })),
    ];
  }, [semanticMap]);

  const filteredPoints = useMemo<SemanticMapPoint[]>(() => {
    if (!semanticMap) return [];
    const query = searchQuery.trim().toLowerCase();
    return semanticMap.points.filter((pt) => {
      const matchesCategory = categoryFilter === 'all' || pt.category === categoryFilter;
      const matchesQuery =
        !query ||
        pt.text.toLowerCase().includes(query) ||
        pt.id.toLowerCase().includes(query) ||
        pt.category.toLowerCase().includes(query);
      return matchesCategory && matchesQuery;
    });
  }, [semanticMap, categoryFilter, searchQuery]);

  const selectedPoint = useMemo(
    () => semanticMap?.points.find((p) => p.id === selectedPointId) ?? null,
    [semanticMap, selectedPointId]
  );

  const estimatedWordCount = useMemo(() => {
    const trimmed = customText.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }, [customText]);

  const exploreCorpusPointNeighbors = async (point: SemanticMapPoint) => {
    setSelectedNeighborsLoading(true);
    setSelectedNeighborsError(null);
    try {
      const result = await steerEmbedding({
        text: point.text,
        concept: customConcept,
        strength: 0.0,
        top_k_neighbors: 5,
        include_embeddings: false,
      });
      setSelectedPointNeighbors(result);
    } catch (err) {
      setSelectedNeighborsError(parseApiError(err));
    } finally {
      setSelectedNeighborsLoading(false);
    }
  };

  const handleSelectCorpusPoint = (id: string) => {
    setSelectedPointId(id);
    setSelectedPointNeighbors(null);
    setSelectedNeighborsError(null);
  };

  const projectCustomText = async () => {
    const trimmed = customText.trim();
    if (!trimmed) {
      setCustomValidationError('Please enter text (1–1000 characters) to project in semantic space.');
      return;
    }
    if (trimmed.length > 1000) {
      setCustomValidationError('Input text must be 1000 characters or fewer.');
      return;
    }
    setCustomValidationError(undefined);
    setCustomLoading(true);
    setCustomError(null);

    try {
      const result = await steerEmbedding({
        text: trimmed,
        concept: customConcept,
        strength: 0.0,
        top_k_neighbors: 5,
        include_embeddings: includeEmbeddings,
      });
      setProjectedTextResult(result);
      setSelectedPointId(null);
    } catch (err) {
      setCustomError(parseApiError(err));
    } finally {
      setCustomLoading(false);
    }
  };

  const handleProjectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void projectCustomText();
  };

  return (
    <div className="space-y-6">
      {/* Plain-English Guide Banner */}
      <Reveal>
        <div className="rounded-2xl border border-border bg-background-surface px-5 py-3.5 flex items-start gap-3 text-xs text-text-secondary shadow-editorial-sm">
          <Info className="w-4 h-4 text-brand-slate shrink-0 mt-0.5" />
          <div className="space-y-1 leading-relaxed">
            <p>
              <strong className="text-brand-navy font-semibold">How to read this map:</strong> Each
              point shows a reference sentence from the {semanticMap?.total_points ?? 'loaded'}
              -sentence backend corpus projected via UMAP into 2D or 3D. Colors indicate reference
              topic labels from <code className="font-mono">corpus.csv</code> rather than
              statistically validated cluster boundaries.
            </p>
            <p className="text-text-muted">
              Projected distances are nonlinear local-neighborhood approximations of 384D geometry
              (and 2D mode projects the <code className="font-mono">(x, y)</code> coordinates of the
              3D UMAP fit). Click any point or project your own sentence below to inspect exact
              384D cosine nearest neighbors.
            </p>
          </div>
        </div>
      </Reveal>

      {/* Top Controls Row */}
      <Reveal delayMs={40}>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {/* Explore Custom Text Panel */}
          <Card className="xl:col-span-2">
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-brand-teal" />
                  Project Custom Text into Semantic Space
                </CardTitle>
                <CardDescription>
                  Encodes your sentence via POST /api/v1/steer (λ = 0.0 neutral baseline) to
                  locate its UMAP coordinates, 384D embedding, and nearest neighbors
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleProjectSubmit} className="space-y-4">
                <Textarea
                  label="Input Text"
                  placeholder="Enter a sentence to embed and locate in semantic space…"
                  rows={2}
                  maxLength={1000}
                  showCount
                  value={customText}
                  onChange={(e) => {
                    setCustomText(e.target.value);
                    if (customValidationError) setCustomValidationError(undefined);
                  }}
                  error={customValidationError}
                />

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

                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
                    <Select
                      label="Reference Concept Axis"
                      options={conceptOptions}
                      value={customConcept}
                      onChange={(val) => setCustomConcept(val as ConceptId)}
                    />
                    <label className="flex items-center gap-2.5 pb-2 text-xs text-text-secondary cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={includeEmbeddings}
                        onChange={(e) => setIncludeEmbeddings(e.target.checked)}
                        className="rounded border-border bg-background-surface text-brand-navy focus:ring-brand-slate/40"
                      />
                      <span>Include raw 384D embedding array</span>
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    {projectedTextResult && (
                      <Button
                        variant="ghost"
                        size="md"
                        onClick={() => setProjectedTextResult(null)}
                      >
                        Clear Point
                      </Button>
                    )}
                    <Button
                      type="submit"
                      loading={customLoading}
                      leftIcon={<Compass className="w-4 h-4" />}
                    >
                      Project in Space
                    </Button>
                  </div>
                </div>

                {customError && (
                  <ErrorAlert error={customError} onRetry={() => void projectCustomText()} />
                )}
              </form>
            </CardContent>
          </Card>

          {/* Dataset Filter Controls */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Dataset Corpus Filter</CardTitle>
                <CardDescription>Filter nodes from GET /api/v1/semantic-map</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                loading={semanticMapLoading}
                onClick={() => void loadSemanticMap(undefined, true)}
                leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
              >
                Reload
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                label="Search Dataset Sentences"
                placeholder="Filter by keyword or ID…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                leftIcon={<Search className="w-4 h-4" />}
              />

              <Select
                label="Cluster Category"
                options={categoryOptions}
                value={categoryFilter}
                onChange={setCategoryFilter}
              />

              {semanticMap && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-border-subtle text-xs text-text-muted font-mono">
                  <span>
                    Showing {filteredPoints.length} / {semanticMap.total_points} points
                  </span>
                  <span>{semanticMap.clusters.length} clusters</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </Reveal>

      {/* Main Plot + Inspector */}
      <Reveal delayMs={80}>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {/* Interactive Plotly Map */}
          <Card className="xl:col-span-2">
            <CardHeader>
              <div>
                <CardTitle>Semantic Embedding Space</CardTitle>
                <CardDescription>
                  Switch between 2D and 3D views, click any corpus point, or pan/orbit to inspect
                  clusters
                </CardDescription>
              </div>
              <ViewModeToggle mode={viewMode} onChange={setViewMode} />
            </CardHeader>
            <CardContent>
              {semanticMapLoading && !semanticMap ? (
                <LoadingState
                  title="Loading Semantic Map…"
                  description="Fetching pre-computed UMAP corpus projection from GET /api/v1/semantic-map."
                />
              ) : semanticMapError && !semanticMap && !projectedTextResult ? (
                <ErrorAlert
                  title="Semantic Map Unavailable"
                  error={semanticMapError}
                  onRetry={() => void loadSemanticMap(undefined, true)}
                />
              ) : !semanticMap && !projectedTextResult ? (
                <EmptyState
                  icon={<Compass className="w-5 h-5" />}
                  title="No Semantic Space Data Available"
                  description="No dataset points were returned by the backend. Try reloading or project a custom sentence above."
                />
              ) : (
                <SemanticSpacePlot
                  mode={viewMode}
                  semanticMap={semanticMap}
                  visiblePoints={filteredPoints}
                  selectedCorpusPointId={selectedPointId}
                  onSelectCorpusPoint={handleSelectCorpusPoint}
                  originalPoint={
                    projectedTextResult
                      ? {
                          label: 'Your Input Text',
                          text: projectedTextResult.input_text,
                          coordinates: projectedTextResult.original.coordinates,
                          conceptScore: projectedTextResult.original.concept_score,
                        }
                      : null
                  }
                  originalNeighbors={projectedTextResult?.original.nearest_neighbors}
                  heightClassName="h-[500px]"
                  emptyTitle="No Matching Points in Filter"
                  emptyDescription="No dataset sentences match your current search or cluster filter. Clear filters or project a custom sentence."
                />
              )}
            </CardContent>
          </Card>

          {/* Right Inspector & Sentence Browser */}
          <div className="space-y-5">
            {/* Active Selection Inspector */}
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Point Inspector</CardTitle>
                  <CardDescription>Backend coordinates, concept scores &amp; embedding</CardDescription>
                </div>
                {selectedPoint && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedPointId(null)}
                    leftIcon={<X className="w-3.5 h-3.5" />}
                  >
                    Clear
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {projectedTextResult && !selectedPoint ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge variant="cyan">Custom Input (λ = 0.0)</Badge>
                      <span className="text-[11px] font-mono text-text-muted">
                        {formatCoordinates(projectedTextResult.original.coordinates, 3)}
                      </span>
                    </div>

                    <div className="rounded-xl border border-border bg-background/80 p-3 text-xs text-text-primary leading-relaxed">
                      {projectedTextResult.input_text}
                    </div>

                    <div className="rounded-xl border border-border bg-background/60 p-3 text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="text-text-muted">
                          {formatConceptLabel(projectedTextResult.concept, config?.steering.concepts)}{' '}
                          Score
                        </span>
                        <span className="font-mono font-semibold text-brand-navy">
                          {formatNumber(projectedTextResult.original.concept_score, 4)}
                        </span>
                      </div>
                    </div>

                    {projectedTextResult.original.embedding && (
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-medium text-text-secondary">
                          384D Embedding Preview
                        </div>
                        <pre className="rounded-xl border border-border bg-background p-2.5 text-[11px] font-mono text-text-secondary overflow-x-auto">
                          {formatEmbeddingSlice(projectedTextResult.original.embedding, 6)}
                        </pre>
                      </div>
                    )}

                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-brand-navy">
                        Nearest Dataset Neighbors (384D Cosine)
                      </div>
                      <NeighborList
                        items={projectedTextResult.original.nearest_neighbors}
                        accent="cyan"
                        onSelectForSteering={(item) =>
                          navigate('/steering', { state: { prefillText: item.text } })
                        }
                      />
                    </div>

                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full"
                      leftIcon={<SlidersHorizontal className="w-3.5 h-3.5 text-brand-teal" />}
                      onClick={() =>
                        navigate('/steering', {
                          state: {
                            prefillText: projectedTextResult.input_text,
                            prefillConcept: projectedTextResult.concept,
                          },
                        })
                      }
                    >
                      Steer This Sentence in Studio
                    </Button>
                  </div>
                ) : selectedPoint ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge variant="violet">{selectedPoint.category}</Badge>
                      <span className="text-xs font-mono text-text-muted">{selectedPoint.id}</span>
                    </div>

                    <div className="rounded-xl border border-border bg-background/80 p-3 text-xs text-text-primary leading-relaxed">
                      {selectedPoint.text}
                    </div>

                    <div className="rounded-xl border border-border bg-background/60 p-3.5 text-xs space-y-2.5">
                      <div className="flex justify-between">
                        <span className="text-text-muted">UMAP Coordinates</span>
                        <span className="font-mono font-medium text-brand-navy">
                          {formatCoordinates(selectedPoint.coordinates, 3)}
                        </span>
                      </div>
                      <div className="border-t border-border-subtle pt-2.5 space-y-1.5">
                        <div className="text-[11px] text-text-muted">Concept Alignments</div>
                        {Object.entries(selectedPoint.concept_scores).map(([key, score]) => (
                          <div key={key} className="flex justify-between text-xs">
                            <span className="text-text-secondary">
                              {formatConceptLabel(key as ConceptId, config?.steering.concepts)}
                            </span>
                            <span className="font-mono font-medium text-brand-teal">
                              {formatNumber(score, 4)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        loading={selectedNeighborsLoading}
                        onClick={() => void exploreCorpusPointNeighbors(selectedPoint)}
                        leftIcon={<Compass className="w-3.5 h-3.5" />}
                      >
                        384D Neighbors
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          navigate('/steering', { state: { prefillText: selectedPoint.text } })
                        }
                        leftIcon={<SlidersHorizontal className="w-3.5 h-3.5 text-brand-teal" />}
                      >
                        Steer Sentence
                      </Button>
                    </div>

                    {selectedNeighborsError && (
                      <ErrorAlert
                        error={selectedNeighborsError}
                        onRetry={() => void exploreCorpusPointNeighbors(selectedPoint)}
                      />
                    )}

                    {selectedPointNeighbors &&
                      selectedPointNeighbors.input_text === selectedPoint.text && (
                        <div className="space-y-2 pt-2 border-t border-border-subtle">
                          <div className="text-xs font-semibold text-brand-navy">
                            Closest 384D Corpus Neighbors
                          </div>
                          <NeighborList
                            items={selectedPointNeighbors.original.nearest_neighbors}
                            accent="cyan"
                            onSelectForSteering={(item) =>
                              navigate('/steering', { state: { prefillText: item.text } })
                            }
                          />
                        </div>
                      )}
                  </div>
                ) : (
                  <EmptyState
                    title="No Point Selected"
                    description="Select a sentence from the dataset list below or click a point on the Plotly map to inspect its coordinates and concept scores."
                  />
                )}
              </CardContent>
            </Card>

            {/* Clickable Dataset Sentences Browser */}
            <Card>
              <CardHeader>
                <CardTitle>Dataset Sentences</CardTitle>
                <CardDescription>Select a reference sentence to highlight</CardDescription>
              </CardHeader>
              <CardContent>
                {filteredPoints.length === 0 ? (
                  <div className="text-xs text-text-muted text-center py-6">
                    {semanticMap
                      ? 'No sentences match your current filter.'
                      : 'Dataset sentences unavailable.'}
                  </div>
                ) : (
                  <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                    {filteredPoints.map((pt) => {
                      const active = pt.id === selectedPointId;
                      return (
                        <button
                          key={pt.id}
                          type="button"
                          onClick={() => handleSelectCorpusPoint(pt.id)}
                          className={`w-full text-left rounded-xl border p-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-slate/40 ${
                            active
                              ? 'border-brand-navy bg-slate-50 shadow-editorial-sm'
                              : 'border-border bg-background/60 hover:border-brand-slate/50 hover:bg-background-surface'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-[10px] font-mono text-text-muted">{pt.id}</span>
                            <Badge variant="neutral">{pt.category}</Badge>
                          </div>
                          <p className="text-xs text-text-primary line-clamp-2 leading-relaxed">
                            {pt.text}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </Reveal>
    </div>
  );
};
