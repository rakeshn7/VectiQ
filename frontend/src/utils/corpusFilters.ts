import type { SemanticMapQueryParams } from '@/types/api';

export interface CorpusFilterState {
  search: string;
  category: string;
  emotion: string;
  sentiment: string;
}

export const INITIAL_CORPUS_FILTERS: CorpusFilterState = {
  search: '',
  category: 'all',
  emotion: 'all',
  sentiment: 'all',
};

/** Normalize draft filter inputs (trims search text). */
export function normalizeCorpusFilters(filters: CorpusFilterState): CorpusFilterState {
  return {
    search: filters.search.trim(),
    category: filters.category || 'all',
    emotion: filters.emotion || 'all',
    sentiment: filters.sentiment || 'all',
  };
}

/** Return true if any filter criterion differs from the unfiltered default. */
export function hasActiveCorpusFilters(filters: CorpusFilterState): boolean {
  const norm = normalizeCorpusFilters(filters);
  return (
    Boolean(norm.search) ||
    norm.category !== 'all' ||
    norm.emotion !== 'all' ||
    norm.sentiment !== 'all'
  );
}

/** Compare two filter states after normalization. */
export function areCorpusFiltersEqual(a: CorpusFilterState, b: CorpusFilterState): boolean {
  const na = normalizeCorpusFilters(a);
  const nb = normalizeCorpusFilters(b);
  return (
    na.search === nb.search &&
    na.category === nb.category &&
    na.emotion === nb.emotion &&
    na.sentiment === nb.sentiment
  );
}

/** Build GET /api/v1/semantic-map query parameters for active corpus filters. */
export function buildSemanticMapFilterParams(
  filters: CorpusFilterState,
  limit = 1000
): SemanticMapQueryParams {
  const norm = normalizeCorpusFilters(filters);
  return {
    limit,
    ...(norm.category !== 'all' ? { category: norm.category } : {}),
    ...(norm.emotion !== 'all' ? { emotion: norm.emotion } : {}),
    ...(norm.sentiment !== 'all' ? { sentiment: norm.sentiment } : {}),
    ...(norm.search ? { search: norm.search } : {}),
  };
}
