import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Compass,
  Filter,
  Info,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import {
  HumanConfirmedDistributionSection,
  HumanVerificationEditor,
} from '@/components/HumanEmotionVerification';
import { NeighborList, type NeighborEmotionMeta } from '@/components/NeighborList';
import { ViewModeToggle } from '@/components/ViewModeToggle';
import {
  EMOTION_COLOR_MAP,
  SemanticSpacePlot,
  type GraphEmotionView,
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
  Textarea,
} from '@/components/ui';
import { useStudio } from '@/hooks/useStudio';
import {
  analyzeSentenceAffect,
  fetchEmotionVerification,
  fetchSemanticMap,
  parseApiError,
  steerEmbedding,
  submitEmotionVerification,
  type ParsedApiError,
} from '@/services';
import type {
  ConceptId,
  EmotionAnalyzeResponse,
  EmotionCategory,
  EmotionReviewHistoryItem,
  EmotionReviewResponse,
  HumanEmotionDistributionItem,
  HumanSentimentLabel,
  ReviewAction,
  SemanticMapPoint,
  SemanticMapResponse,
  SteerResponse,
} from '@/types/api';
import {
  areCorpusFiltersEqual,
  buildSemanticMapFilterParams,
  hasActiveCorpusFilters,
  INITIAL_CORPUS_FILTERS,
  normalizeCorpusFilters,
  type CorpusFilterState,
} from '@/utils/corpusFilters';
import {
  EMOTION_SELECT_OPTIONS,
  formatEmotionDisplay,
  formatEmotionDistributionSummary,
  formatSentimentDisplay,
  loadStoredExplorerCustomSession,
  loadStoredSelectedPointId,
  resolveEffectiveHumanDistribution,
  saveStoredExplorerCustomSession,
  saveStoredSelectedPointId,
  sentimentVariant,
} from '@/utils/emotionDistribution';
import {
  CONTRACT_CONCEPTS,
  formatConceptLabel,
  formatCoordinates,
  formatEmbeddingSlice,
  formatNumber,
} from '@/utils/format';

export const SemanticExplorerPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = (location.state as {
    prefillText?: string;
    prefillConcept?: ConceptId;
    autoRunGuided?: boolean;
  } | null) ?? null;
  const guidedAutoRunRef = useRef<string | null>(null);
  const {
    config,
    semanticMap,
    semanticMapLoading,
    semanticMapError,
    loadSemanticMap,
  } = useStudio();

  const [viewMode, setViewMode] = useState<SpaceViewMode>('2d');
  const [draftFilters, setDraftFilters] = useState<CorpusFilterState>(INITIAL_CORPUS_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<CorpusFilterState | null>(null);
  const [filteredMap, setFilteredMap] = useState<SemanticMapResponse | null>(null);
  const [filterLoading, setFilterLoading] = useState<boolean>(false);
  const [filterError, setFilterError] = useState<ParsedApiError | null>(null);
  const filterRequestIdRef = useRef<number>(0);
  const [colorBy, setColorBy] = useState<'category' | 'emotion'>('emotion');
  const [graphEmotionView, setGraphEmotionView] = useState<GraphEmotionView>('human');
  const [selectedPointId, setSelectedPointId] = useState<string | null>(() => loadStoredSelectedPointId());
  const [selectedPointNeighbors, setSelectedPointNeighbors] = useState<SteerResponse | null>(null);
  const [selectedNeighborsLoading, setSelectedNeighborsLoading] = useState(false);
  const [selectedNeighborsError, setSelectedNeighborsError] = useState<ParsedApiError | null>(null);
  const [selectedPointReview, setSelectedPointReview] = useState<EmotionReviewResponse | null>(null);

  // Custom sentence exploration via POST /api/v1/steer (λ = 0.0) + POST /api/v1/emotions/analyze
  const [customText, setCustomText] = useState('');
  const [customConcept, setCustomConcept] = useState<ConceptId>('positive_sentiment');
  const [includeEmbeddings, setIncludeEmbeddings] = useState(true);
  const [customLoading, setCustomLoading] = useState(false);
  const [customError, setCustomError] = useState<ParsedApiError | null>(null);
  const [customValidationError, setCustomValidationError] = useState<string | undefined>();
  const [projectedTextResult, setProjectedTextResult] = useState<SteerResponse | null>(null);
  const [affectResult, setAffectResult] = useState<EmotionAnalyzeResponse | null>(null);
  const [affectHistory, setAffectHistory] = useState<EmotionReviewHistoryItem[]>([]);
  const restoredCustomRef = useRef<boolean>(false);

  // Human emotion verification status messages
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewError, setReviewError] = useState<ParsedApiError | null>(null);
  const [reviewFeedback, setReviewFeedback] = useState<string | null>(null);

  useEffect(() => {
    void loadSemanticMap();
  }, [loadSemanticMap]);

  // Restore saved custom projected text + human distribution from backend SQLite on page reload
  useEffect(() => {
    if (restoredCustomRef.current || routeState?.autoRunGuided || affectResult) return;
    const saved = loadStoredExplorerCustomSession();
    if (!saved) return;
    restoredCustomRef.current = true;
    setCustomText(saved.text);
    setCustomConcept(saved.concept);
    setIncludeEmbeddings(saved.includeEmbeddings);
    setCustomLoading(true);

    void Promise.allSettled([
      fetchEmotionVerification(saved.recordId),
      steerEmbedding({
        text: saved.text,
        concept: saved.concept,
        strength: 0.0,
        top_k_neighbors: 5,
        include_embeddings: saved.includeEmbeddings,
      }),
    ]).then(([reviewRes, steerRes]) => {
      if (reviewRes.status === 'fulfilled') {
        const rv = reviewRes.value;
        setAffectHistory(rv.history);
        setAffectResult({
          record_id: rv.record_id,
          input_text: rv.input_text,
          sentiment: rv.original_sentiment,
          emotion: rv.original_emotion,
          embedding_info: {
            model_name: config?.model.name ?? 'all-MiniLM-L6-v2',
            dimensions: config?.model.dimensions ?? 384,
            normalized: true,
            umap_coordinates: rv.umap_coordinates,
            concept: saved.concept,
            concept_score:
              steerRes.status === 'fulfilled' ? steerRes.value.original.concept_score : 0,
            embedding: null,
          },
          nearest_neighbors:
            steerRes.status === 'fulfilled'
              ? steerRes.value.original.nearest_neighbors.map((nn) => ({ ...nn }))
              : [],
          review: rv.review,
          created_at: rv.review.reviewed_at ?? new Date().toISOString(),
        });
      } else {
        saveStoredExplorerCustomSession(null);
      }
      if (steerRes.status === 'fulfilled') {
        setProjectedTextResult(steerRes.value);
      }
      setCustomLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const totalCorpusPoints = semanticMap?.total_points ?? 0;

  const displayedPoints = useMemo<SemanticMapPoint[]>(() => {
    if (filteredMap) return filteredMap.points;
    return semanticMap?.points ?? [];
  }, [filteredMap, semanticMap]);

  const hasPendingFilterChanges = useMemo(() => {
    const baseline = appliedFilters ?? INITIAL_CORPUS_FILTERS;
    return !areCorpusFiltersEqual(draftFilters, baseline);
  }, [draftFilters, appliedFilters]);

  const hasAppliedFilters = Boolean(appliedFilters && hasActiveCorpusFilters(appliedFilters));
  const canClearFilters =
    hasActiveCorpusFilters(draftFilters) || hasAppliedFilters || Boolean(filterError) || filterLoading;

  const neighborEmotionLookup = useMemo<Record<string, NeighborEmotionMeta>>(() => {
    const map: Record<string, NeighborEmotionMeta> = {};
    if (semanticMap) {
      for (const pt of semanticMap.points) {
        if (pt.emotion_label || pt.human_emotion_label || pt.human_emotion_distribution?.length) {
          map[pt.id] = {
            emotionLabel: pt.emotion_label ?? null,
            rawLabel: pt.emotion_raw_label ?? null,
            humanLabel: pt.human_emotion_label ?? null,
            humanDistribution: (pt.human_emotion_distribution ?? []).map((d) => ({
              emotion: d.emotion as EmotionCategory,
              percentage: d.percentage,
            })),
          };
        }
      }
    }
    if (affectResult) {
      for (const nn of affectResult.nearest_neighbors) {
        map[nn.id] = {
          emotionLabel: nn.emotion_label ?? null,
          rawLabel: nn.emotion_raw_label ?? null,
          humanLabel: nn.human_emotion_label ?? null,
          humanDistribution: nn.human_emotion_distribution,
        };
      }
    }
    return map;
  }, [semanticMap, affectResult]);

  const selectedPoint = useMemo(
    () =>
      displayedPoints.find((p) => p.id === selectedPointId) ??
      semanticMap?.points.find((p) => p.id === selectedPointId) ??
      null,
    [displayedPoints, semanticMap, selectedPointId]
  );

  // Clear review alerts when switching to a different selected sentence
  useEffect(() => {
    setReviewError(null);
    setReviewFeedback(null);
    setSelectedPointReview(null);
  }, [selectedPoint?.id]);

  // Fetch full revision history when an already-reviewed corpus sentence is inspected
  useEffect(() => {
    if (selectedPoint && selectedPoint.emotion_review_status && selectedPoint.emotion_review_status !== 'unreviewed') {
      void fetchEmotionVerification(selectedPoint.id)
        .then((resp) => {
          setSelectedPointReview(resp);
        })
        .catch(() => {
          // Graceful fallback to semantic-map point summary fields
        });
    }
  }, [selectedPoint?.id, selectedPoint?.emotion_review_status]);

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
    saveStoredSelectedPointId(id);
    setSelectedPointNeighbors(null);
    setSelectedNeighborsError(null);
  };

  const projectCustomText = async (override?: { text?: string; concept?: ConceptId }) => {
    const trimmed = (override?.text ?? customText).trim();
    const targetConcept = override?.concept ?? customConcept;
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
    setReviewError(null);
    setReviewFeedback(null);

    try {
      const [steerRes, affectRes] = await Promise.all([
        steerEmbedding({
          text: trimmed,
          concept: targetConcept,
          strength: 0.0,
          top_k_neighbors: 5,
          include_embeddings: includeEmbeddings,
        }),
        analyzeSentenceAffect({
          text: trimmed,
          concept: targetConcept,
          top_k_neighbors: 5,
          include_embeddings: includeEmbeddings,
        }),
      ]);
      setProjectedTextResult(steerRes);
      setAffectResult(affectRes);
      setAffectHistory([]);
      setSelectedPointId(null);
      saveStoredSelectedPointId(null);
      saveStoredExplorerCustomSession({
        recordId: affectRes.record_id,
        text: trimmed,
        concept: targetConcept,
        includeEmbeddings,
      });
    } catch (err) {
      setCustomError(parseApiError(err));
    } finally {
      setCustomLoading(false);
    }
  };

  const handleEmotionReview = async (
    targetId: string,
    payload: {
      action: ReviewAction;
      distribution?: HumanEmotionDistributionItem[];
      humanSentiment?: HumanSentimentLabel;
      rationale?: string;
    }
  ) => {
    setReviewSaving(true);
    setReviewError(null);
    setReviewFeedback(null);
    try {
      const resp = await submitEmotionVerification({
        record_id: targetId,
        action: payload.action,
        human_emotion_label:
          payload.action === 'flag_uncertain' ? ('uncertain' as EmotionCategory) : undefined,
        human_emotion_distribution: payload.distribution,
        human_sentiment_label:
          payload.action === 'flag_uncertain' ? 'uncertain' : payload.humanSentiment,
        rationale: payload.rationale,
      });
      if (affectResult && affectResult.record_id === targetId) {
        setAffectResult({ ...affectResult, review: resp.review });
        setAffectHistory(resp.history);
      } else {
        setSelectedPointReview(resp);
      }
      await loadSemanticMap(undefined, true);
      if (appliedFilters && hasActiveCorpusFilters(appliedFilters)) {
        await executeFilterQuery(appliedFilters, graphEmotionView, true);
      }
      const distText =
        resp.review.review_status === 'flagged_uncertain'
          ? 'Flagged Uncertain'
          : formatEmotionDistributionSummary(resp.review.human_emotion_distribution) ||
            formatEmotionDisplay(resp.review.human_emotion_label);
      const sentText = resp.review.human_sentiment_label
        ? ` · Sentiment: ${formatSentimentDisplay(resp.review.human_sentiment_label)}`
        : '';
      setReviewFeedback(
        `Saved (${resp.review.review_status}, Rev ${resp.review.revision ?? resp.review.history_count}): Human annotation recorded as ${distText}${sentText} while original model output (${formatEmotionDisplay(
          resp.original_emotion.predicted_emotion
        )}) and UMAP coordinates remain unchanged.`
      );
    } catch (err) {
      setReviewError(parseApiError(err));
    } finally {
      setReviewSaving(false);
    }
  };

  const executeFilterQuery = async (
    filtersToApply: CorpusFilterState,
    labelModeOverride?: GraphEmotionView,
    preserveSelectionOnEmptyMatch = false
  ) => {
    const normalized = normalizeCorpusFilters(filtersToApply);
    const isFiltering = hasActiveCorpusFilters(normalized);
    const reqId = ++filterRequestIdRef.current;
    const effectiveMode = labelModeOverride ?? graphEmotionView;

    setFilterLoading(true);
    setFilterError(null);
    try {
      const result = await fetchSemanticMap({
        ...buildSemanticMapFilterParams(normalized, 1000),
        label_mode: effectiveMode,
      });
      if (reqId !== filterRequestIdRef.current) return;

      setFilteredMap(isFiltering ? result : null);
      setAppliedFilters(isFiltering ? normalized : null);
      if (!isFiltering && !semanticMap) {
        await loadSemanticMap(undefined, true);
      }
      if (normalized.emotion !== 'all') {
        setColorBy('emotion');
      }
      if (
        !preserveSelectionOnEmptyMatch &&
        selectedPointId &&
        !result.points.some((pt) => pt.id === selectedPointId)
      ) {
        setSelectedPointId(null);
        saveStoredSelectedPointId(null);
        setSelectedPointNeighbors(null);
        setSelectedNeighborsError(null);
      }
    } catch (err) {
      if (reqId !== filterRequestIdRef.current) return;
      setFilterError(parseApiError(err));
    } finally {
      if (reqId === filterRequestIdRef.current) {
        setFilterLoading(false);
      }
    }
  };

  const handleGraphEmotionViewChange = (nextView: GraphEmotionView) => {
    setGraphEmotionView(nextView);
    if (appliedFilters && hasActiveCorpusFilters(appliedFilters)) {
      void executeFilterQuery(appliedFilters, nextView, true);
    }
  };

  const handleApplyFiltersSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void executeFilterQuery(draftFilters);
  };

  const handleClearFilters = () => {
    filterRequestIdRef.current += 1;
    setDraftFilters(INITIAL_CORPUS_FILTERS);
    setAppliedFilters(null);
    setFilteredMap(null);
    setFilterError(null);
    setFilterLoading(false);
    if (!semanticMap) {
      void loadSemanticMap(undefined, true);
    }
  };

  const handleReloadOriginalDataset = async () => {
    filterRequestIdRef.current += 1;
    setFilteredMap(null);
    setAppliedFilters(null);
    setFilterError(null);
    setFilterLoading(false);
    await loadSemanticMap(undefined, true);
  };

  useEffect(() => {
    if (routeState?.prefillText) {
      setCustomText(routeState.prefillText);
      setCustomValidationError(undefined);
    }
    if (routeState?.prefillConcept) {
      setCustomConcept(routeState.prefillConcept);
    }
    if (routeState?.autoRunGuided && routeState.prefillText) {
      const sig = `${routeState.prefillText}:${routeState.prefillConcept ?? 'positive_sentiment'}`;
      if (guidedAutoRunRef.current !== sig) {
        guidedAutoRunRef.current = sig;
        void projectCustomText({
          text: routeState.prefillText,
          concept: routeState.prefillConcept,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeState?.prefillText, routeState?.prefillConcept, routeState?.autoRunGuided]);

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
                        onClick={() => {
                          setProjectedTextResult(null);
                          setAffectResult(null);
                          setAffectHistory([]);
                          saveStoredExplorerCustomSession(null);
                        }}
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

              {/* Inline Sentiment & Emotion Analysis + Human Verification directly beneath Project in Space */}
              {affectResult && (
                <div className="mt-5 pt-5 border-t border-border-subtle space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-brand-navy">
                      Projected Sentence Analysis
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-text-muted">
                      <span>UMAP: {formatCoordinates(affectResult.embedding_info.umap_coordinates, 3)}</span>
                      <span>•</span>
                      <span>{affectResult.embedding_info.dimensions}D MiniLM</span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-background/70 px-3.5 py-2.5 text-xs text-text-primary">
                    <span className="font-semibold text-text-muted mr-1.5">Original sentence:</span>
                    &ldquo;{affectResult.input_text}&rdquo;
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Separated Sentiment & Emotion Readout */}
                    <div className="rounded-xl border border-border bg-background/60 p-3.5 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                          Sentiment Polarity
                        </span>
                        <Badge
                          variant={sentimentVariant(
                            affectResult.sentiment.predicted_label,
                            affectResult.sentiment.is_uncertain
                          )}
                        >
                          {affectResult.sentiment.is_uncertain
                            ? `Uncertain (${affectResult.sentiment.predicted_label})`
                            : affectResult.sentiment.predicted_label}{' '}
                          · {(affectResult.sentiment.confidence * 100).toFixed(1)}%
                        </Badge>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                        {(['positive', 'neutral', 'negative'] as const).map((lbl) => (
                          <div key={lbl} className="rounded-lg border border-border-subtle bg-background-surface py-1.5">
                            <span className="capitalize text-text-muted block">{lbl}</span>
                            <span className="font-mono font-semibold text-text-primary">
                              {(affectResult.sentiment.probabilities[lbl] * 100).toFixed(1)}%
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="pt-2 border-t border-border-subtle space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                            Model Prediction — Immutable ({affectResult.emotion.model_name.split('/').pop()})
                          </span>
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background-surface px-2.5 py-0.5 text-[11px] font-medium">
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{
                                backgroundColor:
                                  EMOTION_COLOR_MAP[affectResult.emotion.predicted_emotion]?.color ??
                                  '#64748B',
                              }}
                            />
                            {formatEmotionDisplay(affectResult.emotion.predicted_emotion)} ·{' '}
                            {(affectResult.emotion.confidence * 100).toFixed(1)}%
                          </span>
                        </div>

                        {affectResult.emotion.is_uncertain && affectResult.emotion.uncertainty_reason && (
                          <p className="text-[11px] text-amber-800 bg-amber-50/80 border border-amber-200 rounded-lg px-2.5 py-1">
                            Flagged Uncertain: {affectResult.emotion.uncertainty_reason}
                          </p>
                        )}

                        <div className="space-y-1.5">
                          <div className="text-[11px] font-medium text-text-secondary">
                            Model Probabilities — immutable
                          </div>
                          {affectResult.emotion.probabilities.slice(0, 5).map((item) => (
                            <div key={item.label} className="space-y-0.5">
                              <div className="flex justify-between text-[11px]">
                                <span className="capitalize text-text-secondary">
                                  {item.label}
                                  {item.category !== item.label && (
                                    <span className="text-text-muted"> ({formatEmotionDisplay(item.category)})</span>
                                  )}
                                </span>
                                <span className="font-mono text-text-primary">
                                  {(item.probability * 100).toFixed(1)}%
                                </span>
                              </div>
                              <div className="h-1.5 w-full rounded-full bg-background-elevated overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${Math.max(2, item.probability * 100)}%`,
                                    backgroundColor: EMOTION_COLOR_MAP[item.category]?.color ?? '#64748B',
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>

                        <p className="text-[10px] text-text-muted leading-relaxed">
                          {affectResult.emotion.taxonomy_note}
                        </p>
                      </div>
                    </div>

                    {/* Separate Human-Confirmed Distribution + Multi-Emotion Percentage Verification */}
                    <div className="space-y-3">
                      <HumanConfirmedDistributionSection review={affectResult.review} />
                      <HumanVerificationEditor
                        recordId={affectResult.record_id}
                        originalEmotion={affectResult.emotion.predicted_emotion}
                        originalSentiment={
                          affectResult.sentiment.is_uncertain
                            ? 'uncertain'
                            : affectResult.sentiment.predicted_label
                        }
                        review={affectResult.review}
                        history={affectHistory}
                        saving={reviewSaving}
                        error={reviewError}
                        feedback={reviewFeedback}
                        title="Human Emotion Verification"
                        onSubmit={(payload) => handleEmotionReview(affectResult.record_id, payload)}
                      />
                    </div>
                  </div>
                </div>
              )}
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
                onClick={() => void handleReloadOriginalDataset()}
                leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
              >
                Reload
              </Button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleApplyFiltersSubmit} className="space-y-4">
                <Input
                  label="Search Dataset Sentences"
                  placeholder="Filter by keyword or ID…"
                  value={draftFilters.search}
                  onChange={(e) =>
                    setDraftFilters((prev) => ({ ...prev, search: e.target.value }))
                  }
                  leftIcon={<Search className="w-4 h-4" />}
                />

                <Select
                  label="Cluster Category"
                  options={categoryOptions}
                  value={draftFilters.category}
                  onChange={(val) => setDraftFilters((prev) => ({ ...prev, category: val }))}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Select
                    label="Filter by Emotion"
                    options={[
                      { value: 'all', label: 'All Emotions' },
                      ...EMOTION_SELECT_OPTIONS,
                    ]}
                    value={draftFilters.emotion}
                    onChange={(val) => setDraftFilters((prev) => ({ ...prev, emotion: val }))}
                  />
                  <Select
                    label="Filter by Sentiment"
                    options={[
                      { value: 'all', label: 'All Sentiments' },
                      { value: 'positive', label: 'Positive' },
                      { value: 'neutral', label: 'Neutral' },
                      { value: 'negative', label: 'Negative' },
                      { value: 'mixed', label: 'Mixed' },
                      { value: 'uncertain', label: 'Uncertain' },
                    ]}
                    value={draftFilters.sentiment}
                    onChange={(val) => setDraftFilters((prev) => ({ ...prev, sentiment: val }))}
                  />
                </div>

                <div className="flex items-center justify-between gap-2 pt-1 text-xs">
                  <span className="text-text-secondary font-medium">Node Colors</span>
                  <div className="inline-flex rounded-lg border border-border bg-background-secondary p-0.5">
                    <button
                      type="button"
                      onClick={() => setColorBy('category')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                        colorBy === 'category'
                          ? 'bg-brand-navy text-white'
                          : 'text-text-secondary hover:text-brand-navy'
                      }`}
                    >
                      Corpus Topics
                    </button>
                    <button
                      type="button"
                      onClick={() => setColorBy('emotion')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                        colorBy === 'emotion'
                          ? 'bg-brand-teal text-white'
                          : 'text-text-secondary hover:text-brand-navy'
                      }`}
                    >
                      Emotions
                    </button>
                  </div>
                </div>

                {filterError && (
                  <ErrorAlert
                    error={filterError}
                    onRetry={() => void executeFilterQuery(draftFilters)}
                  />
                )}

                {semanticMap && (
                  <div className="space-y-1.5 pt-2.5 border-t border-border-subtle">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted font-mono">
                      <span>
                        {hasAppliedFilters
                          ? `Matching ${displayedPoints.length} / ${totalCorpusPoints} total points`
                          : `Showing ${displayedPoints.length} / ${totalCorpusPoints} total points`}
                      </span>
                      <span>
                        {(filteredMap ? filteredMap.clusters.length : semanticMap.clusters.length)}{' '}
                        clusters
                      </span>
                    </div>
                    {filterLoading ? (
                      <div className="text-[11px] text-brand-teal font-medium">
                        Filtering corpus via GET /api/v1/semantic-map…
                      </div>
                    ) : hasPendingFilterChanges ? (
                      <div className="text-[11px] text-amber-700 font-medium">
                        Pending filter changes — click Apply Filters to update graph
                      </div>
                    ) : hasAppliedFilters ? (
                      <div className="text-[11px] text-brand-teal font-medium">
                        Filtered results active
                      </div>
                    ) : null}
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="md"
                    onClick={handleClearFilters}
                    disabled={!canClearFilters}
                    leftIcon={<X className="w-4 h-4" />}
                  >
                    Clear Filters
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    loading={filterLoading}
                    leftIcon={<Filter className="w-4 h-4" />}
                  >
                    {filterLoading ? 'Filtering…' : 'Apply Filters'}
                  </Button>
                </div>
              </form>
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
                <div className="relative">
                  {filterLoading && (
                    <div
                      role="status"
                      aria-live="polite"
                      className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background-surface/75 backdrop-blur-[1px]"
                    >
                      <LoadingState
                        title="Filtering Dataset Corpus…"
                        description="Executing selected filters against GET /api/v1/semantic-map."
                      />
                    </div>
                  )}
                  <SemanticSpacePlot
                    mode={viewMode}
                    semanticMap={semanticMap}
                    visiblePoints={displayedPoints}
                    colorBy={colorBy}
                    onColorByChange={setColorBy}
                    emotionView={graphEmotionView}
                    onEmotionViewChange={handleGraphEmotionViewChange}
                    selectedCorpusPointId={selectedPointId}
                    onSelectCorpusPoint={handleSelectCorpusPoint}
                    originalPoint={
                      projectedTextResult
                        ? {
                            label: 'Your Input Text',
                            text: projectedTextResult.input_text,
                            coordinates: projectedTextResult.original.coordinates,
                            conceptScore: projectedTextResult.original.concept_score,
                            emotion: affectResult?.emotion.predicted_emotion ?? null,
                            humanEmotion: affectResult?.review.human_emotion_label ?? null,
                            humanDistribution: affectResult?.review.human_emotion_distribution,
                            humanSentiment: affectResult?.review.human_sentiment_label ?? null,
                            reviewStatus: affectResult?.review.review_status ?? null,
                            sentiment: affectResult?.sentiment.predicted_label ?? null,
                          }
                        : null
                    }
                    originalNeighbors={
                      selectedPoint
                        ? selectedPointNeighbors?.original.nearest_neighbors
                        : projectedTextResult?.original.nearest_neighbors
                    }
                    heightClassName="h-[500px]"
                    emptyTitle="No Matching Points in Filter"
                    emptyDescription="No dataset sentences match your applied filters. Click Clear Filters or project a custom sentence."
                  />
                </div>
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
                    onClick={() => {
                      setSelectedPointId(null);
                      saveStoredSelectedPointId(null);
                    }}
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
                        emotionLookup={neighborEmotionLookup}
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
                      {(selectedPoint.emotion_label || selectedPoint.sentiment_label) && (
                        <div className="border-t border-border-subtle pt-2.5 space-y-1.5">
                          <div className="flex justify-between text-xs">
                            <span className="text-text-muted">Model Emotion (Immutable)</span>
                            <span className="font-medium text-text-primary">
                              {formatEmotionDisplay(selectedPoint.emotion_label)}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-text-muted">Human Emotion</span>
                            <span className="font-semibold text-brand-navy text-right">
                              {selectedPoint.emotion_review_status === 'flagged_uncertain'
                                ? 'Flagged Uncertain'
                                : selectedPoint.human_emotion_distribution?.length
                                ? formatEmotionDistributionSummary(
                                    selectedPoint.human_emotion_distribution
                                  )
                                : selectedPoint.human_emotion_label
                                ? `${formatEmotionDisplay(selectedPoint.human_emotion_label)} 100%`
                                : 'Pending'}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-text-muted">Model Sentiment (Immutable)</span>
                            <span className="capitalize text-text-secondary">
                              {selectedPoint.sentiment_is_uncertain
                                ? `uncertain (${selectedPoint.sentiment_label})`
                                : selectedPoint.sentiment_label}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-text-muted">Human Sentiment</span>
                            <span className="capitalize font-semibold text-brand-navy">
                              {selectedPoint.emotion_review_status === 'flagged_uncertain'
                                ? 'Uncertain'
                                : selectedPoint.human_sentiment_label
                                ? formatSentimentDisplay(selectedPoint.human_sentiment_label)
                                : 'Pending'}
                            </span>
                          </div>
                        </div>
                      )}
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

                    <HumanConfirmedDistributionSection
                      compact
                      review={
                        selectedPointReview?.review ?? {
                          review_status: selectedPoint.emotion_review_status ?? 'unreviewed',
                          human_emotion_label: selectedPoint.human_emotion_label ?? null,
                          human_emotion_distribution: resolveEffectiveHumanDistribution({
                            reviewStatus: selectedPoint.emotion_review_status ?? 'unreviewed',
                            humanLabel: selectedPoint.human_emotion_label ?? null,
                            distribution: selectedPoint.human_emotion_distribution,
                          }),
                          human_sentiment_label: selectedPoint.human_sentiment_label ?? null,
                        }
                      }
                    />

                    <HumanVerificationEditor
                      compact
                      title="Verify Corpus Node Emotion"
                      recordId={selectedPoint.id}
                      originalEmotion={selectedPoint.emotion_label ?? 'neutral'}
                      originalSentiment={
                        (selectedPoint.sentiment_is_uncertain
                          ? 'uncertain'
                          : (selectedPoint.sentiment_label as HumanSentimentLabel)) ?? 'neutral'
                      }
                      review={
                        selectedPointReview?.review ?? {
                          review_status: selectedPoint.emotion_review_status ?? 'unreviewed',
                          human_emotion_label: selectedPoint.human_emotion_label ?? null,
                          human_emotion_distribution: resolveEffectiveHumanDistribution({
                            reviewStatus: selectedPoint.emotion_review_status ?? 'unreviewed',
                            humanLabel: selectedPoint.human_emotion_label ?? null,
                            distribution: selectedPoint.human_emotion_distribution,
                          }),
                          human_sentiment_label: selectedPoint.human_sentiment_label ?? null,
                          history_count: 0,
                        }
                      }
                      history={selectedPointReview?.history ?? []}
                      saving={reviewSaving}
                      error={reviewError}
                      feedback={reviewFeedback}
                      onSubmit={(payload) => handleEmotionReview(selectedPoint.id, payload)}
                    />

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
                            emotionLookup={neighborEmotionLookup}
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
                <div>
                  <CardTitle>Dataset Sentences</CardTitle>
                  <CardDescription>
                    {semanticMap
                      ? `${displayedPoints.length} of ${totalCorpusPoints} points`
                      : 'Select a reference sentence to highlight'}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {filterLoading ? (
                  <div className="text-xs text-text-muted text-center py-6">
                    Filtering dataset sentences…
                  </div>
                ) : displayedPoints.length === 0 ? (
                  <div className="text-xs text-text-muted text-center py-6">
                    {semanticMap
                      ? 'No sentences match your applied filters.'
                      : 'Dataset sentences unavailable.'}
                  </div>
                ) : (
                  <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                    {displayedPoints.map((pt) => {
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
