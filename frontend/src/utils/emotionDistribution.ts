import type {
  ConceptId,
  EmotionCategory,
  EmotionReviewResponse,
  HumanEmotionDistributionItem,
  HumanEmotionOverlay,
  HumanSentimentLabel,
  ReviewStatus,
  SemanticMapHumanEmotionItem,
  SemanticMapPoint,
} from '@/types/api';

export const EMOTION_COLOR_MAP: Record<EmotionCategory, { color: string; label: string }> = {
  joy: { color: '#D97706', label: 'Joy / Happiness' },
  sadness: { color: '#2563EB', label: 'Sadness' },
  anger: { color: '#DC2626', label: 'Anger' },
  fear: { color: '#7C3AED', label: 'Fear' },
  surprise: { color: '#0891B2', label: 'Surprise' },
  disgust: { color: '#65A30D', label: 'Disgust' },
  love: { color: '#BE185D', label: 'Love' },
  neutral: { color: '#64748B', label: 'Neutral' },
  other: { color: '#0F766E', label: 'Other Nuanced' },
  uncertain: { color: '#B45309', label: 'Uncertain' },
};

/** Emotion options selectable inside confirmed multi-emotion distributions (sum = 100%). */
export const CONFIRMED_EMOTION_OPTIONS: Array<{ value: EmotionCategory; label: string }> = [
  { value: 'joy', label: 'Joy / Happiness' },
  { value: 'sadness', label: 'Sadness' },
  { value: 'anger', label: 'Anger' },
  { value: 'fear', label: 'Fear' },
  { value: 'surprise', label: 'Surprise' },
  { value: 'disgust', label: 'Disgust' },
  { value: 'love', label: 'Love' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'other', label: 'Other Nuanced' },
];

/** Filter dropdown options (includes Uncertain for filtering uncertain records). */
export const EMOTION_SELECT_OPTIONS: Array<{ value: EmotionCategory; label: string }> = [
  ...CONFIRMED_EMOTION_OPTIONS,
  { value: 'uncertain', label: 'Uncertain' },
];

export const HUMAN_SENTIMENT_OPTIONS: Array<{ value: HumanSentimentLabel; label: string }> = [
  { value: 'positive', label: 'Positive' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'negative', label: 'Negative' },
  { value: 'mixed', label: 'Mixed' },
  { value: 'uncertain', label: 'Uncertain' },
];

export function formatSentimentDisplay(label: string | null | undefined): string {
  if (!label) return 'Unknown';
  const match = HUMAN_SENTIMENT_OPTIONS.find((opt) => opt.value === label);
  return match ? match.label : label.charAt(0).toUpperCase() + label.slice(1);
}

export const PERCENTAGE_TOTAL_TOLERANCE = 1e-3;

export interface EmotionDistributionDraftRow {
  rowKey: string;
  emotion: EmotionCategory;
  percentageText: string;
}

export interface EmotionDistributionValidationResult {
  valid: boolean;
  total: number;
  errors: string[];
  items: HumanEmotionDistributionItem[];
}

export function formatEmotionDisplay(label: string | null | undefined): string {
  if (!label) return 'Unknown';
  return EMOTION_COLOR_MAP[label as EmotionCategory]?.label ?? label;
}

export function reviewStatusVariant(
  status: string | undefined | null
): 'neutral' | 'emerald' | 'blue' | 'amber' {
  if (status === 'confirmed') return 'emerald';
  if (status === 'corrected') return 'blue';
  if (status === 'flagged_uncertain') return 'amber';
  return 'neutral';
}

export function sentimentVariant(
  label: string | null | undefined,
  isUncertain?: boolean | null
): 'emerald' | 'neutral' | 'rose' | 'amber' | 'violet' {
  if (isUncertain || label === 'uncertain') return 'amber';
  if (label === 'mixed') return 'violet';
  if (label === 'positive') return 'emerald';
  if (label === 'negative') return 'rose';
  return 'neutral';
}

/**
 * Resolve effective human distribution (supporting legacy single-emotion overlays as 100%).
 * Returns empty list for unreviewed or flagged_uncertain annotations.
 */
export function resolveEffectiveHumanDistribution(params: {
  reviewStatus?: ReviewStatus | null;
  humanLabel?: EmotionCategory | null;
  distribution?: ReadonlyArray<{ emotion: string; percentage: number }> | null;
}): HumanEmotionDistributionItem[] {
  if (params.reviewStatus === 'flagged_uncertain' || params.reviewStatus === 'unreviewed') {
    return [];
  }
  if (params.distribution && params.distribution.length > 0) {
    return [...params.distribution]
      .filter((d) => d.emotion !== 'uncertain')
      .map((d) => ({
        emotion: d.emotion as EmotionCategory,
        percentage: Number(d.percentage),
      }))
      .sort((a, b) => b.percentage - a.percentage);
  }
  if (params.humanLabel && params.humanLabel !== 'uncertain') {
    return [{ emotion: params.humanLabel, percentage: 100 }];
  }
  return [];
}

/** Validate multi-emotion percentage rows strictly without silently normalizing invalid totals. */
export function validateEmotionDistribution(
  rows: ReadonlyArray<Pick<EmotionDistributionDraftRow, 'emotion' | 'percentageText'>>
): EmotionDistributionValidationResult {
  const errors: string[] = [];
  if (rows.length === 0) {
    return {
      valid: false,
      total: 0,
      errors: ['Add at least one emotion totaling 100%, or use Mark Uncertain.'],
      items: [],
    };
  }

  const seen = new Set<EmotionCategory>();
  let total = 0;
  let hasNumericError = false;
  const items: HumanEmotionDistributionItem[] = [];

  for (const row of rows) {
    if (seen.has(row.emotion)) {
      errors.push(`Duplicate emotion "${formatEmotionDisplay(row.emotion)}" is not allowed.`);
    }
    seen.add(row.emotion);

    if (row.emotion === 'uncertain') {
      errors.push('Use "Mark Uncertain" instead of entering Uncertain as a percentage.');
    }

    const trimmed = row.percentageText.trim();
    if (!trimmed) {
      errors.push(`Enter a percentage for ${formatEmotionDisplay(row.emotion)}.`);
      hasNumericError = true;
      continue;
    }

    const num = Number(trimmed);
    if (!Number.isFinite(num)) {
      errors.push(`"${trimmed}" is not a valid number for ${formatEmotionDisplay(row.emotion)}.`);
      hasNumericError = true;
      continue;
    }
    if (num < 0) {
      errors.push(`Negative percentage (${num}%) is not allowed for ${formatEmotionDisplay(row.emotion)}.`);
      hasNumericError = true;
    } else if (num > 100) {
      errors.push(`Percentage (${num}%) cannot exceed 100% for ${formatEmotionDisplay(row.emotion)}.`);
      hasNumericError = true;
    }

    total += num;
    items.push({ emotion: row.emotion, percentage: num });
  }

  const roundedTotal = Math.round(total * 10000) / 10000;
  if (!hasNumericError && Math.abs(total - 100) > PERCENTAGE_TOTAL_TOLERANCE) {
    const diff = 100 - total;
    if (diff > 0) {
      errors.push(`Total is ${roundedTotal}% — must equal exactly 100% (add ${diff.toFixed(1)}%).`);
    } else {
      errors.push(
        `Total is ${roundedTotal}% — must equal exactly 100% (reduce by ${Math.abs(diff).toFixed(1)}%).`
      );
    }
  }

  const deduplicatedErrors = Array.from(new Set(errors));
  return {
    valid: deduplicatedErrors.length === 0,
    total: roundedTotal,
    errors: deduplicatedErrors,
    items,
  };
}

export function buildDraftRowsFromReview(
  review: HumanEmotionOverlay | null | undefined,
  fallbackEmotion: EmotionCategory
): EmotionDistributionDraftRow[] {
  const existing = resolveEffectiveHumanDistribution({
    reviewStatus: review?.review_status,
    humanLabel: review?.human_emotion_label ?? null,
    distribution: review?.human_emotion_distribution,
  });

  if (existing.length > 0) {
    return existing.map((item, idx) => ({
      rowKey: `row-${idx}-${item.emotion}`,
      emotion: item.emotion,
      percentageText: String(Number(item.percentage.toFixed(2))),
    }));
  }

  const initialEmotion: EmotionCategory =
    fallbackEmotion && fallbackEmotion !== 'uncertain' ? fallbackEmotion : 'neutral';
  return [
    {
      rowKey: `row-0-${initialEmotion}`,
      emotion: initialEmotion,
      percentageText: '100',
    },
  ];
}

export function buildDraftRowsFromPoint(point: SemanticMapPoint): EmotionDistributionDraftRow[] {
  const existing = resolveEffectiveHumanDistribution({
    reviewStatus: point.emotion_review_status ?? null,
    humanLabel: point.human_emotion_label ?? null,
    distribution: point.human_emotion_distribution,
  });

  if (existing.length > 0) {
    return existing.map((item, idx) => ({
      rowKey: `pt-${point.id}-${idx}-${item.emotion}`,
      emotion: item.emotion,
      percentageText: String(Number(item.percentage.toFixed(2))),
    }));
  }

  const initialEmotion: EmotionCategory =
    point.emotion_label && point.emotion_label !== 'uncertain' ? point.emotion_label : 'neutral';
  return [
    {
      rowKey: `pt-${point.id}-0-${initialEmotion}`,
      emotion: initialEmotion,
      percentageText: '100',
    },
  ];
}

export function formatDistributionPercentage(pct: number): string {
  const rounded = Math.round(pct * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}

export function formatEmotionDistributionSummary(
  dist: ReadonlyArray<{ emotion: string; percentage: number }> | null | undefined
): string {
  if (!dist || dist.length === 0) return '';
  return [...dist]
    .filter((d) => d.percentage > 0)
    .sort((a, b) => b.percentage - a.percentage)
    .map((d) => `${formatEmotionDisplay(d.emotion)} ${formatDistributionPercentage(d.percentage)}`)
    .join(' · ');
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return [100, 116, 139];
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return [r, g, b];
}

function toHexByte(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, '0');
}

/**
 * Blend emotion colors smoothly by human-confirmed percentages for continuous visual encoding.
 * Single-emotion distributions return exact canonical emotion hex color.
 */
export function blendEmotionDistributionColor(
  dist: ReadonlyArray<SemanticMapHumanEmotionItem | HumanEmotionDistributionItem> | null | undefined,
  fallbackEmotion: EmotionCategory | null | undefined
): string {
  const active = (dist ?? []).filter((d) => d.percentage > 0);
  if (active.length === 0) {
    return fallbackEmotion ? EMOTION_COLOR_MAP[fallbackEmotion]?.color ?? '#64748B' : '#64748B';
  }
  if (active.length === 1) {
    const key = active[0].emotion as EmotionCategory;
    return EMOTION_COLOR_MAP[key]?.color ?? '#64748B';
  }

  let totalWeight = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  for (const item of active) {
    const hex = EMOTION_COLOR_MAP[item.emotion as EmotionCategory]?.color ?? '#64748B';
    const [cr, cg, cb] = hexToRgb(hex);
    const w = item.percentage / 100;
    r += cr * w;
    g += cg * w;
    b += cb * w;
    totalWeight += w;
  }
  if (totalWeight <= 0) return '#64748B';
  return `#${toHexByte(r / totalWeight)}${toHexByte(g / totalWeight)}${toHexByte(b / totalWeight)}`;
}

/** Convert an EmotionReviewResponse fetched after reload into overlay info for VectorSteering/Explorer. */
export function hasMultipleEmotions(
  dist: ReadonlyArray<{ percentage: number }> | null | undefined
): boolean {
  return (dist ?? []).filter((d) => d.percentage > 0).length > 1;
}

export function distributionToOverlay(resp: EmotionReviewResponse): HumanEmotionOverlay {
  return resp.review;
}

// ---------------------------------------------------------------------------
// Reload-resilient session ID persistence (stores only record_id & request params;
// full probabilities and human distributions are always re-fetched from backend)
// ---------------------------------------------------------------------------

const STEER_SESSION_STORAGE_KEY = 'vectiq_active_steer_session_v1';
const EXPLORER_CUSTOM_STORAGE_KEY = 'vectiq_active_explorer_custom_v1';
const EXPLORER_SELECTED_POINT_KEY = 'vectiq_active_explorer_point_v1';

export interface StoredSteerSession {
  recordId: string;
  text: string;
  concept: ConceptId;
  strength: number;
  topK: number;
  includeEmbeddings: boolean;
}

export interface StoredExplorerCustomSession {
  recordId: string;
  text: string;
  concept: ConceptId;
  includeEmbeddings: boolean;
}

function readStorageJson<T>(key: string): T | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeStorageJson<T>(key: string, value: T | null): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    if (value === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    // Ignore storage access errors in private/restricted browsers
  }
}

export function loadStoredSteerSession(): StoredSteerSession | null {
  return readStorageJson<StoredSteerSession>(STEER_SESSION_STORAGE_KEY);
}

export function saveStoredSteerSession(session: StoredSteerSession | null): void {
  writeStorageJson(STEER_SESSION_STORAGE_KEY, session);
}

export function loadStoredExplorerCustomSession(): StoredExplorerCustomSession | null {
  return readStorageJson<StoredExplorerCustomSession>(EXPLORER_CUSTOM_STORAGE_KEY);
}

export function saveStoredExplorerCustomSession(session: StoredExplorerCustomSession | null): void {
  writeStorageJson(EXPLORER_CUSTOM_STORAGE_KEY, session);
}

export function loadStoredSelectedPointId(): string | null {
  return readStorageJson<string>(EXPLORER_SELECTED_POINT_KEY);
}

export function saveStoredSelectedPointId(pointId: string | null): void {
  writeStorageJson(EXPLORER_SELECTED_POINT_KEY, pointId);
}
