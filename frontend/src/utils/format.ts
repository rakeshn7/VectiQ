import type { ConceptId, ConceptMetadata, Coordinate3D } from '@/types/api';

/**
 * Canonical concept metadata matching contracts/api-contract.md Section 1.3 & 3.2.
 * Used for UI display when /api/v1/config has not yet responded.
 */
export const CONTRACT_CONCEPTS: ConceptMetadata[] = [
  {
    id: 'positive_sentiment',
    label: 'Positive Sentiment',
    description: 'Steers emotional valence towards optimism and constructive feedback.',
    negative_label: 'Negative Sentiment',
    positive_label: 'Positive Sentiment',
  },
  {
    id: 'technical_tone',
    label: 'Technical Tone',
    description: 'Steers phrasing towards analytical, specialized engineering terminology.',
    negative_label: 'Colloquial / Simple',
    positive_label: 'Technical / Analytical',
  },
  {
    id: 'formal_tone',
    label: 'Formal Tone',
    description: 'Steers tone towards executive, professional, and academic register.',
    negative_label: 'Casual / Informal',
    positive_label: 'Formal / Professional',
  },
];

export const CONTRACT_STEERING_BOUNDS = {
  min_strength: -1.0,
  max_strength: 1.0,
  default_strength: 0.0,
  step: 0.05,
} as const;

function normalizeZero(value: number, decimals: number): number {
  const threshold = 0.5 * Math.pow(10, -decimals);
  return Math.abs(value) < threshold ? 0 : value;
}

export function formatNumber(value: number | undefined | null, decimals = 4): string {
  if (value === null || value === undefined || Number.isNaN(value) || !Number.isFinite(value)) {
    return '—';
  }
  return normalizeZero(value, decimals).toFixed(decimals);
}

export function formatSigned(value: number | undefined | null, decimals = 4): string {
  if (value === null || value === undefined || Number.isNaN(value) || !Number.isFinite(value)) {
    return '—';
  }
  const normalized = normalizeZero(value, decimals);
  const prefix = normalized > 0 ? '+' : '';
  return `${prefix}${normalized.toFixed(decimals)}`;
}

export function formatPercent(value: number | undefined | null, decimals = 1): string {
  if (value === null || value === undefined || Number.isNaN(value) || !Number.isFinite(value)) {
    return '—';
  }
  return `${normalizeZero(value * 100, decimals).toFixed(decimals)}%`;
}

export function formatCoordinates(coords: Coordinate3D | undefined | null, decimals = 3): string {
  if (!coords) return '—';
  return `(${formatNumber(coords.x, decimals)}, ${formatNumber(coords.y, decimals)}, ${formatNumber(coords.z, decimals)})`;
}

export function formatConceptLabel(conceptId: ConceptId, concepts?: ConceptMetadata[]): string {
  const match = (concepts ?? CONTRACT_CONCEPTS).find((c) => c.id === conceptId);
  if (match) return match.label;
  return conceptId
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function formatEmbeddingSlice(embedding: number[] | undefined | null, count = 8): string {
  if (!embedding || embedding.length === 0) return 'Not included in payload';
  const head = embedding.slice(0, count).map((v) => formatNumber(v, 4)).join(', ');
  const suffix = embedding.length > count ? `, … (${embedding.length} dims)` : '';
  return `[${head}${suffix}]`;
}

export function formatTimestamp(iso?: string | null): string {
  if (!iso) return '—';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
