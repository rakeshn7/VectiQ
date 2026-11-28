import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Info, UserCheck } from 'lucide-react';
import { EMOTION_COLOR_MAP } from '@/components/charts';
import { Badge, Button, ErrorAlert, Input, LoadingState, Select } from '@/components/ui';
import { parseApiError, submitEmotionVerification, type ParsedApiError } from '@/services';
import type {
  EmotionAnalyzeResponse,
  EmotionCategory,
  HumanEmotionOverlay,
  ReviewAction,
} from '@/types/api';
import { formatTimestamp } from '@/utils/format';

export const EMOTION_SELECT_OPTIONS: Array<{ value: EmotionCategory; label: string }> = [
  { value: 'joy', label: 'Joy / Happiness' },
  { value: 'sadness', label: 'Sadness' },
  { value: 'anger', label: 'Anger' },
  { value: 'fear', label: 'Fear' },
  { value: 'surprise', label: 'Surprise' },
  { value: 'disgust', label: 'Disgust' },
  { value: 'love', label: 'Love' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'other', label: 'Other Nuanced' },
  { value: 'uncertain', label: 'Uncertain' },
];

const CORE_CANONICAL_EMOTIONS = new Set<string>([
  'love',
  'joy',
  'sadness',
  'anger',
  'fear',
  'surprise',
  'disgust',
  'neutral',
]);

export function formatEmotionDisplay(label: string | null | undefined): string {
  if (!label) return 'Unknown';
  return EMOTION_COLOR_MAP[label as EmotionCategory]?.label ?? label;
}

export function sentimentVariant(
  label: string | null | undefined,
  isUncertain?: boolean | null
): 'emerald' | 'neutral' | 'rose' | 'amber' {
  if (isUncertain || label === 'uncertain') return 'amber';
  if (label === 'positive') return 'emerald';
  if (label === 'negative') return 'rose';
  return 'neutral';
}

function reviewStatusVariant(
  status: string | undefined
): 'neutral' | 'emerald' | 'blue' | 'amber' {
  if (status === 'confirmed') return 'emerald';
  if (status === 'corrected') return 'blue';
  if (status === 'flagged_uncertain') return 'amber';
  return 'neutral';
}

export interface EmotionAnalysisPanelProps {
  affectResult: EmotionAnalyzeResponse | null;
  loading: boolean;
  error: ParsedApiError | null;
  currentInputText: string;
  onRetry?: () => void;
  onReviewUpdated: (recordId: string, review: HumanEmotionOverlay) => void;
}

export const EmotionAnalysisPanel: React.FC<EmotionAnalysisPanelProps> = ({
  affectResult,
  loading,
  error,
  currentInputText,
  onRetry,
  onReviewUpdated,
}) => {
  const [showAllLabels, setShowAllLabels] = useState(false);
  const [humanEmotionChoice, setHumanEmotionChoice] = useState<EmotionCategory>('neutral');
  const [humanNote, setHumanNote] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewError, setReviewError] = useState<ParsedApiError | null>(null);
  const [reviewFeedback, setReviewFeedback] = useState<string | null>(null);

  useEffect(() => {
    setReviewError(null);
    setReviewFeedback(null);
    setShowAllLabels(false);
    if (affectResult) {
      setHumanEmotionChoice(
        affectResult.review.human_emotion_label ?? affectResult.emotion.predicted_emotion
      );
      setHumanNote(affectResult.review.rationale ?? '');
    }
  }, [affectResult?.record_id]);

  const primaryProbItems = useMemo(() => {
    if (!affectResult) return [];
    const topRaw = affectResult.emotion.raw_top_label;
    return affectResult.emotion.probabilities.filter(
      (item) =>
        CORE_CANONICAL_EMOTIONS.has(item.label) ||
        item.label === topRaw ||
        (item.category === 'other' && item.probability >= 0.05)
    );
  }, [affectResult]);

  const visibleProbItems = useMemo(() => {
    if (!affectResult) return [];
    if (showAllLabels || affectResult.emotion.probabilities.length <= primaryProbItems.length) {
      return affectResult.emotion.probabilities;
    }
    return primaryProbItems;
  }, [affectResult, showAllLabels, primaryProbItems]);

  const handleReviewSubmit = async (action: ReviewAction, targetEmotion: EmotionCategory) => {
    if (!affectResult) return;
    setReviewSaving(true);
    setReviewError(null);
    setReviewFeedback(null);
    try {
      const resp = await submitEmotionVerification({
        record_id: affectResult.record_id,
        action,
        human_emotion_label: targetEmotion,
        rationale: humanNote.trim() || undefined,
      });
      onReviewUpdated(affectResult.record_id, resp.review);
      setHumanEmotionChoice(resp.review.human_emotion_label ?? targetEmotion);
      setReviewFeedback(
        `Saved (${resp.review.review_status}): Human emotion recorded as ${formatEmotionDisplay(
          resp.review.human_emotion_label
        )} while original model output (${formatEmotionDisplay(
          resp.original_emotion.predicted_emotion
        )}) remains unchanged.`
      );
    } catch (err) {
      setReviewError(parseApiError(err));
    } finally {
      setReviewSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-background/75 p-4">
        <LoadingState
          title="Analyzing Sentiment & Emotions…"
          description="Running RoBERTa sentiment & GoEmotions multi-emotion classifiers on original input text."
        />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorAlert
        title="Sentiment & Emotion Classifier Unavailable"
        error={error}
        onRetry={onRetry}
      />
    );
  }

  if (!affectResult) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-background/60 px-3.5 py-3 text-xs text-text-secondary flex items-start gap-2.5">
        <Info className="w-4 h-4 text-brand-teal shrink-0 mt-0.5" />
        <span className="leading-relaxed">
          <strong className="text-brand-navy font-semibold">Emotion Analysis:</strong> Click{' '}
          <strong>Apply Steering</strong> below to analyze this original sentence with the
          sentiment and GoEmotions classifiers alongside vector steering.
        </span>
      </div>
    );
  }

  const inputEditedSinceRun =
    currentInputText.trim().length > 0 && currentInputText.trim() !== affectResult.input_text;
  const activeEmotionColor =
    EMOTION_COLOR_MAP[
      affectResult.review.human_emotion_label ?? affectResult.emotion.predicted_emotion
    ]?.color ?? '#64748B';

  return (
    <div className="rounded-xl border border-border bg-background/75 p-4 space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-0.5">
          <div className="text-xs font-semibold text-brand-navy">
            Sentiment &amp; Emotion Analysis
          </div>
          <div className="text-[11px] text-text-muted">
            Evaluates the original text independently of steering concept or λ
          </div>
        </div>
        <Badge variant="neutral">Original Text Only</Badge>
      </div>

      {/* Original sentence evaluated */}
      <div className="rounded-lg border border-border-subtle bg-background-surface px-3 py-2 text-xs text-text-primary">
        <span className="font-semibold text-text-muted mr-1.5">Analyzed sentence:</span>
        &ldquo;{affectResult.input_text}&rdquo;
      </div>

      {inputEditedSinceRun && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/75 px-2.5 py-1.5 text-[11px] text-amber-900">
          Input sentence changed since last run — click <strong>Apply Steering</strong> to analyze
          the updated text.
        </div>
      )}

      {/* Sentiment Polarity Readout */}
      <div className="rounded-lg border border-border-subtle bg-background-surface p-3 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Sentiment
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

        {affectResult.sentiment.is_uncertain && affectResult.sentiment.uncertainty_reason && (
          <p className="text-[11px] text-amber-800 bg-amber-50/80 border border-amber-200 rounded-md px-2.5 py-1">
            Uncertain sentiment: {affectResult.sentiment.uncertainty_reason}
          </p>
        )}

        <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
          {(['positive', 'neutral', 'negative'] as const).map((lbl) => (
            <div
              key={lbl}
              className="rounded-lg border border-border-subtle bg-background/70 py-1.5"
            >
              <span className="capitalize text-text-muted block">{lbl}</span>
              <span className="font-mono font-semibold text-text-primary">
                {(affectResult.sentiment.probabilities[lbl] * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Detected Emotion + All Supported Probability Bars */}
      <div className="rounded-lg border border-border-subtle bg-background-surface p-3 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Detected Emotion ({affectResult.emotion.model_name.split('/').pop()})
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-0.5 text-[11px] font-medium text-text-primary">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: activeEmotionColor }}
            />
            {formatEmotionDisplay(affectResult.emotion.predicted_emotion)} ·{' '}
            {(affectResult.emotion.confidence * 100).toFixed(1)}%
          </span>
        </div>

        {(affectResult.emotion.predicted_emotion === 'other' ||
          affectResult.emotion.predicted_emotion === 'uncertain') && (
          <div className="text-[11px] text-text-secondary">
            Raw top classifier label:{' '}
            <code className="font-mono font-semibold text-brand-navy">
              {affectResult.emotion.raw_top_label}
            </code>{' '}
            ({(affectResult.emotion.confidence * 100).toFixed(1)}%)
          </div>
        )}

        {affectResult.emotion.is_uncertain && affectResult.emotion.uncertainty_reason && (
          <p className="text-[11px] text-amber-800 bg-amber-50/80 border border-amber-200 rounded-md px-2.5 py-1">
            Uncertain emotion: {affectResult.emotion.uncertainty_reason}
          </p>
        )}

        <div className="space-y-1.5 pt-0.5">
          <div className="text-[11px] font-medium text-text-secondary">
            Emotion Probabilities ({visibleProbItems.length} shown)
          </div>
          <div className="max-h-56 overflow-y-auto pr-1 space-y-1.5">
            {visibleProbItems.map((item) => {
              const pct = item.probability * 100;
              return (
                <div key={item.label} className="space-y-0.5">
                  <div className="flex justify-between text-[11px]">
                    <span className="capitalize text-text-secondary">
                      {item.label}
                      {item.label === 'joy' && (
                        <span className="text-text-muted"> (Joy / Happiness)</span>
                      )}
                      {item.category !== item.label && item.label !== 'joy' && (
                        <span className="text-text-muted">
                          {' '}
                          ({formatEmotionDisplay(item.category)})
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-text-primary tabular-nums">
                      {pct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-background-elevated overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-200"
                      style={{
                        width: `${Math.min(100, pct)}%`,
                        minWidth: item.probability > 0 ? '2px' : '0px',
                        backgroundColor: EMOTION_COLOR_MAP[item.category]?.color ?? '#64748B',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {affectResult.emotion.probabilities.length > primaryProbItems.length && (
          <button
            type="button"
            onClick={() => setShowAllLabels((prev) => !prev)}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-teal hover:text-brand-navy transition-colors"
          >
            {showAllLabels ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Show core &amp; top labels ({primaryProbItems.length})</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span>
                  Show all {affectResult.emotion.probabilities.length} supported GoEmotions labels
                </span>
              </>
            )}
          </button>
        )}

        <p className="text-[10px] text-text-muted leading-relaxed">
          {affectResult.emotion.taxonomy_note}
        </p>
      </div>

      {/* Human Verification Controls */}
      <div className="rounded-lg border border-border-subtle bg-background-surface p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            <UserCheck className="w-3.5 h-3.5 text-brand-teal" />
            Human Verification
          </span>
          <Badge variant={reviewStatusVariant(affectResult.review.review_status)}>
            {affectResult.review.review_status.replace('_', ' ')}
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border border-border-subtle bg-background/70 px-2.5 py-1.5">
            <span className="text-[10px] text-text-muted block">
              Original Model Prediction (Immutable)
            </span>
            <span className="font-semibold text-text-primary">
              {formatEmotionDisplay(affectResult.emotion.predicted_emotion)}
            </span>
          </div>
          <div className="rounded-lg border border-border-subtle bg-background/70 px-2.5 py-1.5">
            <span className="text-[10px] text-text-muted block">Human-Confirmed Emotion</span>
            <span className="font-semibold text-brand-navy">
              {affectResult.review.human_emotion_label
                ? formatEmotionDisplay(affectResult.review.human_emotion_label)
                : 'Pending verification'}
            </span>
          </div>
        </div>

        {affectResult.review.reviewed_at && (
          <div className="text-[10px] font-mono text-text-muted">
            Last updated: {formatTimestamp(affectResult.review.reviewed_at)} (
            {affectResult.review.history_count} log entries)
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={reviewSaving}
            onClick={() =>
              void handleReviewSubmit('confirm', affectResult.emotion.predicted_emotion)
            }
            leftIcon={<CheckCircle2 className="w-3.5 h-3.5 text-brand-teal" />}
          >
            Confirm {formatEmotionDisplay(affectResult.emotion.predicted_emotion)}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            loading={reviewSaving}
            onClick={() => void handleReviewSubmit('flag_uncertain', 'uncertain')}
          >
            Mark Uncertain
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-end">
          <Select
            label="Select / Correct Emotion"
            options={EMOTION_SELECT_OPTIONS}
            value={humanEmotionChoice}
            onChange={(val) => setHumanEmotionChoice(val as EmotionCategory)}
          />
          <Button
            type="button"
            variant="primary"
            size="md"
            loading={reviewSaving}
            onClick={() =>
              void handleReviewSubmit(
                humanEmotionChoice === 'uncertain'
                  ? 'flag_uncertain'
                  : humanEmotionChoice === affectResult.emotion.predicted_emotion
                  ? 'confirm'
                  : 'correct',
                humanEmotionChoice
              )
            }
          >
            Submit Correction
          </Button>
        </div>

        <Input
          label="Correction Note (Optional)"
          value={humanNote}
          onChange={(e) => setHumanNote(e.target.value)}
          placeholder="Optional note explaining correction…"
        />

        {reviewError && <ErrorAlert error={reviewError} />}
        {reviewFeedback && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-900">
            {reviewFeedback}
          </div>
        )}
      </div>
    </div>
  );
};
