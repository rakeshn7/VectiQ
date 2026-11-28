import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  History,
  Plus,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { Badge, Button, ErrorAlert, Input } from '@/components/ui';
import type { ParsedApiError } from '@/services';
import type {
  EmotionCategory,
  EmotionReviewHistoryItem,
  HumanEmotionDistributionItem,
  HumanEmotionOverlay,
  HumanSentimentLabel,
  ReviewAction,
  ReviewStatus,
} from '@/types/api';
import {
  buildDraftRowsFromReview,
  CONFIRMED_EMOTION_OPTIONS,
  EMOTION_COLOR_MAP,
  formatDistributionPercentage,
  formatEmotionDisplay,
  formatEmotionDistributionSummary,
  formatSentimentDisplay,
  HUMAN_SENTIMENT_OPTIONS,
  resolveEffectiveHumanDistribution,
  reviewStatusVariant,
  sentimentVariant,
  validateEmotionDistribution,
  type EmotionDistributionDraftRow,
} from '@/utils/emotionDistribution';
import { formatTimestamp } from '@/utils/format';

export interface HumanConfirmedDistributionSectionProps {
  review: {
    review_status?: ReviewStatus | null;
    human_emotion_label?: EmotionCategory | null;
    human_emotion_distribution?: ReadonlyArray<{ emotion: string; percentage: number }> | null;
    human_sentiment_label?: HumanSentimentLabel | null;
    rationale?: string | null;
    reviewed_at?: string | null;
    revision?: number | null;
    history_count?: number | null;
  };
  compact?: boolean;
}

/** Separate immutable display section strictly for human-confirmed percentage bars (never model confidence). */
export const HumanConfirmedDistributionSection: React.FC<
  HumanConfirmedDistributionSectionProps
> = ({ review, compact = false }) => {
  const status: ReviewStatus = review.review_status ?? 'unreviewed';
  const effectiveDist = useMemo(
    () =>
      resolveEffectiveHumanDistribution({
        reviewStatus: status,
        humanLabel: review.human_emotion_label ?? null,
        distribution: review.human_emotion_distribution,
      }),
    [status, review.human_emotion_label, review.human_emotion_distribution]
  );

  const isConfirmed =
    (status === 'confirmed' || status === 'corrected') && effectiveDist.length > 0;
  const revNumber = review.revision ?? review.history_count ?? 0;

  return (
    <div
      className={`rounded-lg border border-border-subtle bg-background-surface ${
        compact ? 'p-2.5 space-y-2' : 'p-3 space-y-2.5'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-brand-navy">
            Human-Confirmed Emotion Distribution
          </h4>
          <p className="text-[10px] text-text-muted">
            Human-confirmed percentages (annotator proportions — not model probability)
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {revNumber > 0 && (
            <Badge variant="neutral">Rev {revNumber}</Badge>
          )}
          <Badge variant={reviewStatusVariant(status)}>
            {status.replace('_', ' ')}
          </Badge>
        </div>
      </div>

      {status === 'flagged_uncertain' ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-2.5 py-2 text-[11px] text-amber-900">
          <strong>Flagged Uncertain:</strong> Reviewer marked this sentence ambiguous without a
          confirmed 100% distribution. Excluded from confirmed ground-truth evaluation.
        </div>
      ) : !isConfirmed ? (
        <div className="rounded-lg border border-dashed border-border bg-background/60 px-2.5 py-2 text-[11px] text-text-muted">
          Pending human verification — enter emotion percentages below totaling 100%, confirm the
          model label, or mark uncertain.
        </div>
      ) : (
        <div className="space-y-1.5">
          {effectiveDist.map((item) => {
            const barColor = EMOTION_COLOR_MAP[item.emotion]?.color ?? '#0F766E';
            const pctClamped = Math.max(0, Math.min(100, item.percentage));
            return (
              <div key={item.emotion} className="space-y-0.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5 font-medium text-text-primary">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: barColor }}
                    />
                    <span>{formatEmotionDisplay(item.emotion)}</span>
                  </span>
                  <span className="font-mono font-semibold text-brand-navy tabular-nums">
                    {formatDistributionPercentage(item.percentage)}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-background-elevated overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-200"
                    style={{
                      width: `${pctClamped}%`,
                      minWidth: item.percentage > 0 ? '3px' : '0px',
                      backgroundColor: barColor,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(review.human_sentiment_label || status === 'flagged_uncertain') && (
        <div className="flex items-center justify-between rounded-md border border-border-subtle bg-background/60 px-2 py-1 text-[11px]">
          <span className="text-text-muted font-medium">Human-Confirmed Sentiment</span>
          <Badge
            variant={sentimentVariant(
              review.human_sentiment_label ?? (status === 'flagged_uncertain' ? 'uncertain' : null)
            )}
          >
            {formatSentimentDisplay(
              review.human_sentiment_label ?? (status === 'flagged_uncertain' ? 'uncertain' : null)
            )}
          </Badge>
        </div>
      )}

      {(review.rationale || review.reviewed_at) && (
        <div className="pt-1 border-t border-border-subtle space-y-0.5 text-[10.5px] text-text-muted">
          {review.rationale && (
            <div className="text-text-secondary">
              <span className="font-medium">Note:</span> {review.rationale}
            </div>
          )}
          {review.reviewed_at && (
            <div className="font-mono">
              Recorded: {formatTimestamp(review.reviewed_at)} ({review.history_count ?? revNumber}{' '}
              audit entries)
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export interface HumanVerificationEditorProps {
  recordId: string;
  originalEmotion: EmotionCategory;
  originalSentiment?: HumanSentimentLabel;
  review: HumanEmotionOverlay;
  history?: EmotionReviewHistoryItem[];
  saving: boolean;
  error: ParsedApiError | null;
  feedback: string | null;
  onSubmit: (payload: {
    action: ReviewAction;
    distribution?: HumanEmotionDistributionItem[];
    humanSentiment?: HumanSentimentLabel;
    rationale?: string;
  }) => Promise<void> | void;
  title?: string;
  compact?: boolean;
}

/** Interactive multi-emotion percentage editor preserving immutable original predictions. */
export const HumanVerificationEditor: React.FC<HumanVerificationEditorProps> = ({
  recordId,
  originalEmotion,
  originalSentiment,
  review,
  history = [],
  saving,
  error,
  feedback,
  onSubmit,
  title = 'Human Verification',
  compact = false,
}) => {
  const [draftRows, setDraftRows] = useState<EmotionDistributionDraftRow[]>(() =>
    buildDraftRowsFromReview(review, originalEmotion)
  );
  const [humanSentimentChoice, setHumanSentimentChoice] = useState<HumanSentimentLabel>(
    review.human_sentiment_label ?? originalSentiment ?? 'neutral'
  );
  const [note, setNote] = useState<string>(review.rationale ?? '');

  // Reset editor rows cleanly only when recordId or saved revision changes
  const savedRevision = review.revision ?? review.history_count ?? 0;
  useEffect(() => {
    setDraftRows(buildDraftRowsFromReview(review, originalEmotion));
    setHumanSentimentChoice(review.human_sentiment_label ?? originalSentiment ?? 'neutral');
    setNote(review.rationale ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId, savedRevision, review.review_status, review.human_sentiment_label]);

  const validation = useMemo(() => validateEmotionDistribution(draftRows), [draftRows]);

  const usedEmotions = useMemo(
    () => new Set(draftRows.map((r) => r.emotion)),
    [draftRows]
  );

  const availableNextEmotion = useMemo(() => {
    return CONFIRMED_EMOTION_OPTIONS.find((opt) => !usedEmotions.has(opt.value))?.value ?? null;
  }, [usedEmotions]);

  const humanSummaryText = useMemo(() => {
    if (review.review_status === 'flagged_uncertain') {
      return 'Uncertain (excluded from ground truth)';
    }
    const dist = resolveEffectiveHumanDistribution({
      reviewStatus: review.review_status,
      humanLabel: review.human_emotion_label ?? null,
      distribution: review.human_emotion_distribution,
    });
    if (dist.length === 0) return 'Pending verification';
    const distText = formatEmotionDistributionSummary(dist);
    return review.human_sentiment_label
      ? `${distText} · Sentiment: ${formatSentimentDisplay(review.human_sentiment_label)}`
      : distText;
  }, [review]);

  const handleAddRow = () => {
    if (!availableNextEmotion) return;
    setDraftRows((prev) => [
      ...prev,
      {
        rowKey: `row-${Date.now()}-${prev.length}-${availableNextEmotion}`,
        emotion: availableNextEmotion,
        percentageText: '0',
      },
    ]);
  };

  const handleRemoveRow = (rowKey: string) => {
    setDraftRows((prev) => prev.filter((r) => r.rowKey !== rowKey));
  };

  const handleEmotionChange = (rowKey: string, nextEmotion: EmotionCategory) => {
    setDraftRows((prev) =>
      prev.map((r) => (r.rowKey === rowKey ? { ...r, emotion: nextEmotion } : r))
    );
  };

  const handlePercentageChange = (rowKey: string, nextText: string) => {
    setDraftRows((prev) =>
      prev.map((r) => (r.rowKey === rowKey ? { ...r, percentageText: nextText } : r))
    );
  };

  const handleSubmitDistribution = () => {
    if (!validation.valid || saving) return;
    const activeNonZero = validation.items.filter((i) => i.percentage > 0);
    const isExactEmotionConfirm =
      activeNonZero.length === 1 && activeNonZero[0].emotion === originalEmotion;
    const isExactSentimentConfirm =
      !originalSentiment || humanSentimentChoice === originalSentiment;
    const isExactModelConfirm = isExactEmotionConfirm && isExactSentimentConfirm;
    void onSubmit({
      action: isExactModelConfirm ? 'confirm' : 'correct',
      distribution: validation.items,
      humanSentiment: humanSentimentChoice,
      rationale: note.trim() || undefined,
    });
  };

  const handleConfirmOriginal = () => {
    if (originalEmotion === 'uncertain' || saving) return;
    void onSubmit({
      action: 'confirm',
      distribution: [{ emotion: originalEmotion, percentage: 100 }],
      humanSentiment: originalSentiment ?? humanSentimentChoice,
      rationale: note.trim() || undefined,
    });
  };

  const handleFlagUncertain = () => {
    if (saving) return;
    void onSubmit({
      action: 'flag_uncertain',
      humanSentiment: 'uncertain',
      rationale: note.trim() || undefined,
    });
  };

  const totalIsValid = Math.abs(validation.total - 100) <= 1e-3 && validation.valid;

  return (
    <div
      className={`rounded-lg border border-border-subtle bg-background-surface ${
        compact ? 'p-3 space-y-2.5' : 'p-3.5 space-y-3'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          <UserCheck className="w-3.5 h-3.5 text-brand-teal" />
          {title}
        </span>
        <Badge variant={reviewStatusVariant(review.review_status)}>
          {review.review_status.replace('_', ' ')}
        </Badge>
      </div>

      {/* Side-by-side summary keeping immutable model prediction separated from human annotation */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg border border-border-subtle bg-background/70 px-2.5 py-1.5">
          <span className="text-[10px] text-text-muted block">
            Original Model Prediction (Immutable)
          </span>
          <span className="font-semibold text-text-primary">
            {formatEmotionDisplay(originalEmotion)}
            {originalSentiment ? ` · Sentiment: ${formatSentimentDisplay(originalSentiment)}` : ''}
          </span>
        </div>
        <div className="rounded-lg border border-border-subtle bg-background/70 px-2.5 py-1.5">
          <span className="text-[10px] text-text-muted block">Human-Confirmed Annotation</span>
          <span className="font-semibold text-brand-navy">{humanSummaryText}</span>
        </div>
      </div>

      {/* Quick actions: Confirm single model prediction at 100% or Mark Uncertain (no % needed) */}
      <div className="flex flex-wrap gap-2">
        {originalEmotion !== 'uncertain' && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={saving}
            onClick={handleConfirmOriginal}
            leftIcon={<CheckCircle2 className="w-3.5 h-3.5 text-brand-teal" />}
          >
            Confirm {formatEmotionDisplay(originalEmotion)} (100%)
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          loading={saving}
          onClick={handleFlagUncertain}
        >
          Mark Uncertain
        </Button>
      </div>

      {/* Multi-emotion percentage builder */}
      <div className="rounded-lg border border-border bg-background/55 p-2.5 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-semibold text-brand-navy">
            Custom Emotion Percentage Distribution
          </span>
          <span
            className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full border ${
              totalIsValid
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-rose-50 text-rose-700 border-rose-200'
            }`}
          >
            Total: {Number.isFinite(validation.total) ? `${validation.total}%` : '—'}
            {totalIsValid ? ' ✓' : ' / 100%'}
          </span>
        </div>

        <div className="space-y-2">
          {draftRows.map((row) => {
            const otherUsed = new Set(
              draftRows.filter((r) => r.rowKey !== row.rowKey).map((r) => r.emotion)
            );
            const emoColor = EMOTION_COLOR_MAP[row.emotion]?.color ?? '#64748B';
            return (
              <div
                key={row.rowKey}
                className="grid grid-cols-[minmax(0,1fr)_88px_auto] gap-2 items-center"
              >
                <div className="relative flex items-center gap-1.5 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: emoColor }}
                  />
                  <select
                    aria-label="Emotion category"
                    value={row.emotion}
                    onChange={(e) =>
                      handleEmotionChange(row.rowKey, e.target.value as EmotionCategory)
                    }
                    className="w-full rounded-lg border border-border bg-background-surface px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-brand-slate focus:ring-2 focus:ring-brand-slate/20"
                  >
                    {CONFIRMED_EMOTION_OPTIONS.map((opt) => (
                      <option
                        key={opt.value}
                        value={opt.value}
                        disabled={otherUsed.has(opt.value)}
                      >
                        {opt.label}
                        {otherUsed.has(opt.value) ? ' (selected)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    aria-label={`${formatEmotionDisplay(row.emotion)} percentage`}
                    value={row.percentageText}
                    onChange={(e) => handlePercentageChange(row.rowKey, e.target.value)}
                    placeholder="0"
                    className="w-full rounded-lg border border-border bg-background-surface pl-2.5 pr-6 py-1.5 text-xs font-mono text-right text-text-primary focus:outline-none focus:border-brand-slate focus:ring-2 focus:ring-brand-slate/20"
                  />
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-mono text-text-muted">
                    %
                  </span>
                </div>

                <button
                  type="button"
                  aria-label={`Remove ${formatEmotionDisplay(row.emotion)}`}
                  title="Remove emotion"
                  onClick={() => handleRemoveRow(row.rowKey)}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-border bg-background-surface text-text-muted hover:text-rose-700 hover:border-rose-300 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddRow}
            disabled={!availableNextEmotion || saving}
            leftIcon={<Plus className="w-3.5 h-3.5" />}
          >
            Add Emotion
          </Button>
          <span className="text-[10.5px] text-text-muted">
            Supports 1 (100%) or multiple emotions summing to 100%
          </span>
        </div>

        {!validation.valid && validation.errors.length > 0 && (
          <div
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50/85 px-2.5 py-2 text-[11px] text-rose-800 space-y-0.5"
          >
            {validation.errors.map((errMsg, idx) => (
              <div key={idx} className="flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{errMsg}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="space-y-1">
          <label
            htmlFor={`human-sentiment-${recordId}`}
            className="block text-[11px] font-semibold text-brand-navy"
          >
            Human-Confirmed Sentiment
          </label>
          <select
            id={`human-sentiment-${recordId}`}
            aria-label="Human-Confirmed Sentiment"
            value={humanSentimentChoice}
            onChange={(e) => setHumanSentimentChoice(e.target.value as HumanSentimentLabel)}
            disabled={saving}
            className="w-full rounded-lg border border-border bg-background-surface px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-brand-slate focus:ring-2 focus:ring-brand-slate/20"
          >
            {HUMAN_SENTIMENT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <Input
          label="Correction Note (Optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note explaining this emotion distribution…"
        />
        <Button
          type="button"
          variant="primary"
          size="md"
          className="w-full"
          loading={saving}
          disabled={!validation.valid || saving}
          onClick={handleSubmitDistribution}
        >
          Submit Correction
        </Button>
      </div>

      {error && <ErrorAlert error={error} />}
      {feedback && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-900">
          {feedback}
        </div>
      )}

      {history.length > 0 && (
        <details className="group rounded-lg border border-border-subtle bg-background/70 px-2.5 py-2 text-[11px] text-text-secondary">
          <summary className="cursor-pointer select-none font-medium text-brand-navy flex items-center justify-between list-none">
            <span className="inline-flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-brand-teal" />
              Revision History ({history.length})
            </span>
            <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-2 pt-2 border-t border-border-subtle space-y-2 max-h-40 overflow-y-auto pr-1">
            {[...history].reverse().map((item) => {
              const distSummary =
                item.new_status === 'flagged_uncertain'
                  ? 'Flagged Uncertain'
                  : item.new_human_distribution && item.new_human_distribution.length > 0
                  ? formatEmotionDistributionSummary(item.new_human_distribution)
                  : `${formatEmotionDisplay(item.new_human_emotion)} 100%`;
              return (
                <div
                  key={item.history_id}
                  className="rounded border border-border-subtle bg-background-surface px-2 py-1.5 space-y-0.5 text-[10.5px]"
                >
                  <div className="flex items-center justify-between gap-2 font-mono text-text-muted">
                    <span>
                      Rev {item.revision} &bull; {item.new_status.replace('_', ' ')}
                    </span>
                    <span>{formatTimestamp(item.reviewed_at)}</span>
                  </div>
                  <div className="font-medium text-brand-navy">
                    {distSummary}
                    {item.new_human_sentiment && (
                      <span className="ml-1.5 text-[10px] font-normal text-text-secondary">
                        · Sentiment: {formatSentimentDisplay(item.new_human_sentiment)}
                      </span>
                    )}
                  </div>
                  {item.rationale && <div className="text-text-secondary">{item.rationale}</div>}
                </div>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
};
