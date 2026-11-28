import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  GitCompareArrows,
  Info,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import {
  EmotionAnalysisPanel,
  formatEmotionDisplay,
  sentimentVariant,
} from '@/components/EmotionAnalysisPanel';
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
  Reveal,
  Select,
  Slider,
  Textarea,
  Tooltip,
} from '@/components/ui';
import { useStudio } from '@/hooks/useStudio';
import {
  analyzeSentenceAffect,
  fetchEmotionVerification,
  parseApiError,
  steerEmbedding,
  type ParsedApiError,
} from '@/services';
import type { ConceptId, EmotionReviewHistoryItem, HumanEmotionOverlay } from '@/types/api';
import {
  formatEmotionDistributionSummary,
  formatSentimentDisplay,
  loadStoredSteerSession,
  saveStoredSteerSession,
} from '@/utils/emotionDistribution';
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
  const location = useLocation();
  const routeState = (location.state as {
    prefillText?: string;
    prefillConcept?: ConceptId;
    prefillStrength?: number;
    autoRunGuided?: boolean;
  } | null) ?? null;
  const guidedAutoRunRef = useRef<string | null>(null);

  const {
    config,
    configError,
    semanticMap,
    loadSemanticMap,
    lastSteerRequest,
    lastSteerResult,
    lastSteerAffectResult,
    setActiveSteerRun,
    setLastSteerAffectResult,
    clearActiveSteerRun,
  } = useStudio();

  const concepts = config?.steering.concepts ?? CONTRACT_CONCEPTS;
  const minStrength = config?.steering.min_strength ?? CONTRACT_STEERING_BOUNDS.min_strength;
  const maxStrength = config?.steering.max_strength ?? CONTRACT_STEERING_BOUNDS.max_strength;
  const stepStrength = config?.steering.step ?? CONTRACT_STEERING_BOUNDS.step;
  const defaultStrength = config?.steering.default_strength ?? CONTRACT_STEERING_BOUNDS.default_strength;

  const [text, setText] = useState<string>(
    routeState?.prefillText ?? lastSteerRequest?.text ?? SAMPLE_PROMPTS[0]
  );
  const [concept, setConcept] = useState<ConceptId>(
    routeState?.prefillConcept ?? lastSteerRequest?.concept ?? 'technical_tone'
  );
  const [strength, setStrength] = useState<number>(lastSteerRequest?.strength ?? 0.5);
  const [topK, setTopK] = useState<number>(lastSteerRequest?.top_k_neighbors ?? 5);
  const [includeEmbeddings, setIncludeEmbeddings] = useState<boolean>(
    lastSteerRequest?.include_embeddings ?? true
  );

  const [viewMode, setViewMode] = useState<SpaceViewMode>('2d');
  const [showCorpusOverlay, setShowCorpusOverlay] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [apiError, setApiError] = useState<ParsedApiError | null>(null);
  const [affectLoading, setAffectLoading] = useState<boolean>(false);
  const [affectError, setAffectError] = useState<ParsedApiError | null>(null);
  const [affectHistory, setAffectHistory] = useState<EmotionReviewHistoryItem[]>([]);
  const [validationError, setValidationError] = useState<string | undefined>();
  const steerSeqRef = useRef<number>(0);
  const affectSeqRef = useRef<number>(0);
  const restoredSessionRef = useRef<boolean>(false);

  useEffect(() => {
    if (routeState?.prefillText) {
      setText(routeState.prefillText);
      setValidationError(undefined);
    }
    if (routeState?.prefillConcept) {
      setConcept(routeState.prefillConcept);
    }
    if (typeof routeState?.prefillStrength === 'number') {
      setStrength(routeState.prefillStrength);
    }
    if (routeState?.autoRunGuided && routeState.prefillText) {
      const sig = `${routeState.prefillText}:${routeState.prefillConcept ?? ''}:${String(routeState.prefillStrength ?? '')}`;
      if (guidedAutoRunRef.current !== sig) {
        guidedAutoRunRef.current = sig;
        void executeSteering({
          text: routeState.prefillText,
          concept: routeState.prefillConcept ?? concept,
          strength: routeState.prefillStrength ?? strength,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    routeState?.prefillText,
    routeState?.prefillConcept,
    routeState?.prefillStrength,
    routeState?.autoRunGuided,
  ]);

  useEffect(() => {
    void loadSemanticMap();
  }, [loadSemanticMap]);

  // Restore saved active sentence & human verification from backend SQLite on browser page reload
  useEffect(() => {
    if (restoredSessionRef.current || routeState?.autoRunGuided || lastSteerAffectResult) {
      return;
    }
    const saved = loadStoredSteerSession();
    if (!saved) return;
    restoredSessionRef.current = true;

    setText(saved.text);
    setConcept(saved.concept);
    setStrength(saved.strength);
    setTopK(saved.topK);
    setIncludeEmbeddings(saved.includeEmbeddings);

    const steerSeq = ++steerSeqRef.current;
    const affectSeq = ++affectSeqRef.current;
    setLoading(true);
    setAffectLoading(true);

    const steerPayload = {
      text: saved.text,
      concept: saved.concept,
      strength: saved.strength,
      top_k_neighbors: saved.topK,
      include_embeddings: saved.includeEmbeddings,
    };

    void Promise.allSettled([
      fetchEmotionVerification(saved.recordId),
      steerEmbedding(steerPayload),
    ]).then(([reviewRes, steerRes]) => {
      if (reviewRes.status === 'fulfilled' && affectSeq === affectSeqRef.current) {
        const rv = reviewRes.value;
        setAffectHistory(rv.history);
        setLastSteerAffectResult({
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
        setAffectError(null);
      } else if (reviewRes.status === 'rejected') {
        saveStoredSteerSession(null);
      }
      if (affectSeq === affectSeqRef.current) setAffectLoading(false);

      if (steerRes.status === 'fulfilled' && steerSeq === steerSeqRef.current) {
        setActiveSteerRun(steerPayload, steerRes.value);
      }
      if (steerSeq === steerSeqRef.current) setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const estimatedWordCount = useMemo(() => {
    const trimmed = text.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }, [text]);

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

  const runAffectAnalysis = async (
    trimmedText: string,
    affectSeq: number,
    conceptOverride?: ConceptId,
    strengthOverride?: number
  ) => {
    const targetConcept = conceptOverride ?? concept;
    const targetStrength = strengthOverride ?? strength;
    try {
      const response = await analyzeSentenceAffect({
        text: trimmedText,
        concept: targetConcept,
        top_k_neighbors: topK,
        include_embeddings: false,
      });
      if (affectSeq !== affectSeqRef.current) return;
      setLastSteerAffectResult(response);
      setAffectHistory([]);
      setAffectError(null);
      saveStoredSteerSession({
        recordId: response.record_id,
        text: trimmedText,
        concept: targetConcept,
        strength: targetStrength,
        topK,
        includeEmbeddings,
      });
    } catch (err) {
      if (affectSeq !== affectSeqRef.current) return;
      setAffectError(parseApiError(err));
    } finally {
      if (affectSeq === affectSeqRef.current) {
        setAffectLoading(false);
      }
    }
  };

  const executeSteering = async (override?: {
    text?: string;
    concept?: ConceptId;
    strength?: number;
  }) => {
    const trimmed = (override?.text ?? text).trim();
    const targetConcept = override?.concept ?? concept;
    const targetStrength = override?.strength ?? strength;
    if (!trimmed) {
      setValidationError('Please enter input text (1–1000 characters).');
      return;
    }
    if (trimmed.length > 1000) {
      setValidationError('Input text cannot exceed 1000 characters.');
      return;
    }

    setValidationError(undefined);
    const steerSeq = ++steerSeqRef.current;
    const affectSeq = ++affectSeqRef.current;
    setLoading(true);
    setAffectLoading(true);
    setApiError(null);
    setAffectError(null);

    const payload = {
      text: trimmed,
      concept: targetConcept,
      strength: targetStrength,
      top_k_neighbors: topK,
      include_embeddings: includeEmbeddings,
    };

    const steerTask = (async () => {
      try {
        const response = await steerEmbedding(payload);
        if (steerSeq !== steerSeqRef.current) return;
        setActiveSteerRun(payload, response);
      } catch (err) {
        if (steerSeq !== steerSeqRef.current) return;
        setApiError(parseApiError(err));
      } finally {
        if (steerSeq === steerSeqRef.current) {
          setLoading(false);
        }
      }
    })();

    const affectTask = runAffectAnalysis(trimmed, affectSeq, targetConcept, targetStrength);
    await Promise.allSettled([steerTask, affectTask]);
  };

  const retryAffectOnly = () => {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > 1000) {
      setValidationError('Please enter input text (1–1000 characters).');
      return;
    }
    const affectSeq = ++affectSeqRef.current;
    setAffectLoading(true);
    setAffectError(null);
    void runAffectAnalysis(trimmed, affectSeq);
  };

  const handleAffectReviewUpdated = (
    recordId: string,
    review: HumanEmotionOverlay,
    history?: EmotionReviewHistoryItem[]
  ) => {
    setLastSteerAffectResult((prev) =>
      prev && prev.record_id === recordId ? { ...prev, review } : prev
    );
    if (history) {
      setAffectHistory(history);
    }
    void loadSemanticMap(undefined, true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void executeSteering();
  };

  const handleReset = () => {
    steerSeqRef.current += 1;
    affectSeqRef.current += 1;
    setText(SAMPLE_PROMPTS[0]);
    setConcept('technical_tone');
    setStrength(defaultStrength);
    setTopK(5);
    setIncludeEmbeddings(true);
    setValidationError(undefined);
    setApiError(null);
    setAffectError(null);
    setAffectHistory([]);
    setAffectLoading(false);
    setLoading(false);
    saveStoredSteerSession(null);
    clearActiveSteerRun();
  };

  return (
    <div className="space-y-6">
      {configError && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-2">
          <span>
            <strong className="font-semibold">Contract Parameter Mode:</strong>{' '}
            <code className="font-mono">GET /api/v1/config</code> is currently unavailable (
            {configError.code}). Form controls use schema defaults from{' '}
            <code className="font-mono">contracts/api-contract.md</code>.
          </span>
        </div>
      )}

      {/* Plain-English Orientation Banner */}
      <Reveal>
        <div className="rounded-2xl border border-border bg-background-surface px-5 py-3.5 flex items-start gap-3 text-xs text-text-secondary shadow-editorial-sm">
          <Info className="w-4 h-4 text-brand-teal shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong className="text-brand-navy font-semibold">How steering works:</strong> Enter a
            sentence, choose a contrastive concept axis, and adjust strength{' '}
            <code className="font-mono">λ ∈ [-1.0, +1.0]</code>. Strength{' '}
            <code className="font-mono">0.0</code> leaves the vector completely unchanged (100%
            preservation baseline). Positive or negative strength shifts the 384D representation and
            retrieves real corpus sentences as geometric proxies—VectiQ inspects embedding movement
            rather than generating rewritten text.
          </p>
        </div>
      </Reveal>

      <Reveal delayMs={40}>
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Left Control Workbench */}
          <Card className="xl:col-span-5">
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-brand-teal" />
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
                        className="text-[11px] px-2.5 py-0.5 rounded-md border border-border bg-background-secondary/70 text-text-secondary hover:text-brand-navy hover:border-brand-slate/60 transition-colors"
                      >
                        Sample {idx + 1}
                      </button>
                    ))}
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
                </div>

                {/* Compact Sentiment & Emotion Analysis + Human Verification directly beneath Input Sentence */}
                <EmotionAnalysisPanel
                  affectResult={lastSteerAffectResult}
                  initialHistory={affectHistory}
                  loading={affectLoading}
                  error={affectError}
                  currentInputText={text}
                  onRetry={retryAffectOnly}
                  onReviewUpdated={handleAffectReviewUpdated}
                />

                <div className="space-y-2">
                  <Select
                    label="Semantic Concept"
                    options={concepts.map((c) => ({ value: c.id, label: c.label }))}
                    value={concept}
                    onChange={(val) => setConcept(val as ConceptId)}
                  />
                  {selectedConceptMeta && (
                    <div className="rounded-xl border border-border bg-background/75 p-3.5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-brand-navy">
                          {selectedConceptMeta.label}
                        </span>
                        <Badge variant="violet">{selectedConceptMeta.id}</Badge>
                      </div>
                      <p className="text-[11px] text-text-secondary leading-relaxed">
                        {selectedConceptMeta.description}
                      </p>
                      <div className="rounded-lg border border-border-subtle bg-background-surface px-2.5 py-1.5 text-[10.5px] font-mono text-text-secondary flex flex-wrap items-center justify-between gap-2">
                        <span>E&prime; = normalize(E + &alpha; &middot; D)</span>
                        <span className="text-text-muted">D = {selectedConceptMeta.id} (384D)</span>
                      </div>
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
                      className="rounded border-border bg-background-surface text-brand-navy focus:ring-brand-slate/40"
                    />
                    <span>Include 384D embeddings</span>
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-border-subtle">
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
                <Card className="border-brand-slate/30">
                  <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1.5 min-w-0">
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
                      <p
                        className="text-xs text-text-secondary truncate"
                        title={lastSteerResult.input_text}
                      >
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
                        Original (navy circle) vs. Steered (teal diamond) in consistent UMAP
                        projection
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      {semanticMap && (
                        <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={showCorpusOverlay}
                            onChange={(e) => setShowCorpusOverlay(e.target.checked)}
                            className="rounded border-border bg-background-surface text-brand-navy focus:ring-brand-slate/40"
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
                        emotion:
                          lastSteerAffectResult &&
                          lastSteerAffectResult.input_text === lastSteerResult.input_text
                            ? lastSteerAffectResult.emotion.predicted_emotion
                            : null,
                        humanEmotion:
                          lastSteerAffectResult &&
                          lastSteerAffectResult.input_text === lastSteerResult.input_text
                            ? lastSteerAffectResult.review.human_emotion_label ?? null
                            : null,
                        humanDistribution:
                          lastSteerAffectResult &&
                          lastSteerAffectResult.input_text === lastSteerResult.input_text
                            ? lastSteerAffectResult.review.human_emotion_distribution
                            : undefined,
                        humanSentiment:
                          lastSteerAffectResult &&
                          lastSteerAffectResult.input_text === lastSteerResult.input_text
                            ? lastSteerAffectResult.review.human_sentiment_label ?? null
                            : null,
                        reviewStatus:
                          lastSteerAffectResult &&
                          lastSteerAffectResult.input_text === lastSteerResult.input_text
                            ? lastSteerAffectResult.review.review_status
                            : null,
                        sentiment:
                          lastSteerAffectResult &&
                          lastSteerAffectResult.input_text === lastSteerResult.input_text
                            ? lastSteerAffectResult.sentiment.predicted_label
                            : null,
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
                      <div className="mt-1.5 text-lg font-mono font-semibold text-brand-navy tabular-nums">
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
                        <Tooltip content="Cosine similarity between original and steered 384D embeddings (100% = identical meaning)." />
                      </div>
                      <div className="mt-1.5 text-lg font-mono font-semibold text-emerald-700 tabular-nums">
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
                      <div className="mt-1.5 text-lg font-mono font-semibold text-brand-teal tabular-nums">
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
                      <div className="mt-1.5 text-lg font-mono font-semibold text-amber-700 tabular-nums">
                        {formatNumber(
                          lastSteerResult.movement.coordinate_shift.projection_displacement,
                          3
                        )}
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
      </Reveal>

      {/* Scientific Trade-off & Proxy Note when steering result is active */}
      {lastSteerResult && !loading && !apiError && (
        <Reveal delayMs={65}>
          <div className="rounded-2xl border border-border bg-background-surface px-5 py-3.5 flex items-start gap-3 text-xs text-text-secondary shadow-editorial-sm">
            <Info className="w-4 h-4 text-brand-slate shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong className="text-brand-navy font-semibold">Interpretation note:</strong> At{' '}
              <code className="font-mono font-medium text-brand-navy">
                λ = {formatSigned(lastSteerResult.strength, 2)}
              </code>
              , semantic preservation relative to the unsteered baseline is{' '}
              <code className="font-mono font-medium text-brand-navy">
                {formatPercent(lastSteerResult.preservation.semantic_preservation_score, 1)}
              </code>
              . Larger <code className="font-mono">|λ|</code> values intentionally push embeddings
              further toward the target pole at the expense of original meaning retention.
              {(lastSteerResult.concept === 'technical_tone' ||
                lastSteerResult.concept === 'formal_tone') && (
                <>
                  {' '}
                  Note that <code className="font-mono">technical_tone</code> and{' '}
                  <code className="font-mono">formal_tone</code> share partial geometric alignment
                  in the corpus, so strong technical steering can modestly lift formal-tone scores.
                </>
              )}
            </p>
          </div>
        </Reveal>
      )}

      {/* Embedding & Nearest Neighbor Detail Section */}
      {lastSteerResult && !loading && !apiError && (
        <Reveal delayMs={70}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Original Vector & Neighbors */}
            <Card>
              <CardHeader>
                <div>
                  <CardTitle className="text-brand-navy">Original Representation</CardTitle>
                  <CardDescription>
                    Coords {formatCoordinates(lastSteerResult.original.coordinates, 3)} &bull;
                    Concept Score {formatNumber(lastSteerResult.original.concept_score, 4)}
                  </CardDescription>
                </div>
                <Badge variant="cyan">Baseline</Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                {lastSteerAffectResult &&
                  lastSteerAffectResult.input_text === lastSteerResult.input_text && (
                    <div className="rounded-xl border border-border-subtle bg-background/70 px-3 py-2.5 text-xs flex flex-wrap items-center justify-between gap-2">
                      <span className="text-text-muted font-medium">Original Input Affect</span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge
                          variant={sentimentVariant(
                            lastSteerAffectResult.sentiment.predicted_label,
                            lastSteerAffectResult.sentiment.is_uncertain
                          )}
                        >
                          Model:{' '}
                          {lastSteerAffectResult.sentiment.is_uncertain
                            ? `Uncertain (${lastSteerAffectResult.sentiment.predicted_label})`
                            : lastSteerAffectResult.sentiment.predicted_label}{' '}
                          ({(lastSteerAffectResult.sentiment.confidence * 100).toFixed(1)}%)
                        </Badge>
                        {lastSteerAffectResult.review.human_sentiment_label && (
                          <Badge
                            variant={sentimentVariant(
                              lastSteerAffectResult.review.human_sentiment_label
                            )}
                          >
                            Human:{' '}
                            {formatSentimentDisplay(
                              lastSteerAffectResult.review.human_sentiment_label
                            )}
                          </Badge>
                        )}
                        <Badge variant="violet">
                          {lastSteerAffectResult.review.review_status === 'flagged_uncertain'
                            ? 'Uncertain (human flagged)'
                            : lastSteerAffectResult.review.human_emotion_distribution?.length
                            ? `${formatEmotionDistributionSummary(
                                lastSteerAffectResult.review.human_emotion_distribution
                              )} (human verified)`
                            : formatEmotionDisplay(
                                lastSteerAffectResult.review.human_emotion_label ??
                                  lastSteerAffectResult.emotion.predicted_emotion
                              )}
                        </Badge>
                      </div>
                    </div>
                  )}
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-text-secondary">
                    384D Embedding Preview
                  </div>
                  <pre className="rounded-xl border border-border bg-background p-3 text-[11px] font-mono text-text-secondary overflow-x-auto">
                    {formatEmbeddingSlice(lastSteerResult.original.embedding, 8)}
                  </pre>
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-brand-navy">
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
                  <CardTitle className="text-brand-teal">Steered Representation</CardTitle>
                  <CardDescription>
                    Coords {formatCoordinates(lastSteerResult.steered.coordinates, 3)} &bull;
                    Concept Score {formatNumber(lastSteerResult.steered.concept_score, 4)}
                  </CardDescription>
                </div>
                <Badge variant="violet">λ = {formatSigned(lastSteerResult.strength, 2)}</Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-text-secondary">
                    384D Steered Embedding Preview
                  </div>
                  <pre className="rounded-xl border border-border bg-background p-3 text-[11px] font-mono text-text-secondary overflow-x-auto">
                    {formatEmbeddingSlice(lastSteerResult.steered.embedding, 8)}
                  </pre>
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-brand-teal">
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
        </Reveal>
      )}
    </div>
  );
};
