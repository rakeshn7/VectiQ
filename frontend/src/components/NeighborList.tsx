import React, { useState } from 'react';
import { ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react';
import { Badge } from '@/components/ui';
import type { EmotionCategory, NearestNeighborItem } from '@/types/api';
import { formatCoordinates, formatNumber } from '@/utils/format';
import { cn } from '@/utils/cn';

export interface NeighborEmotionMeta {
  emotionLabel?: EmotionCategory | null;
  rawLabel?: string | null;
  humanLabel?: EmotionCategory | null;
}

export interface NeighborListProps {
  items: NearestNeighborItem[];
  accent?: 'cyan' | 'violet';
  highlightIds?: Set<string>;
  highlightLabel?: string;
  highlightVariant?: 'amber' | 'rose' | 'emerald';
  retainedIds?: Set<string>;
  emotionLookup?: Record<string, NeighborEmotionMeta>;
  onSelectForSteering?: (item: NearestNeighborItem) => void;
  emptyText?: string;
}

export const NeighborList: React.FC<NeighborListProps> = ({
  items,
  accent = 'cyan',
  highlightIds,
  highlightLabel = 'New Neighbor',
  highlightVariant = 'amber',
  retainedIds,
  emotionLookup,
  onSelectForSteering,
  emptyText = 'No nearest neighbors returned.',
}) => {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  if (!items || items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border-strong px-4 py-6 text-center text-xs text-text-muted">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {items.map((item, idx) => {
        const key = `${item.id}-${idx}`;
        const isHighlighted = highlightIds?.has(item.id) ?? false;
        const isRetained = !isHighlighted && (retainedIds?.has(item.id) ?? false);
        const isExpanded = expandedKey === key;
        const barWidth = Math.max(0, Math.min(100, item.cosine_similarity * 100));

        return (
          <div
            key={key}
            className={cn(
              'rounded-xl border p-3.5 bg-background/60 transition-colors',
              isHighlighted
                ? highlightVariant === 'rose'
                  ? 'border-rose-300 bg-rose-50/50'
                  : 'border-teal-300 bg-teal-50/70'
                : 'border-border'
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-mono text-text-muted">#{idx + 1}</span>
                <span className="text-xs font-mono text-text-secondary">{item.id}</span>
                <Badge variant={accent === 'violet' ? 'violet' : 'cyan'}>{item.category}</Badge>
                {(() => {
                  const meta = emotionLookup?.[item.id];
                  const activeEmo = meta?.humanLabel ?? meta?.emotionLabel;
                  if (!activeEmo) return null;
                  return (
                    <Badge variant="neutral" className="capitalize">
                      {activeEmo === 'joy' ? 'joy / happiness' : activeEmo}
                      {meta?.humanLabel ? ' (verified)' : ''}
                    </Badge>
                  );
                })()}
                {isHighlighted && <Badge variant={highlightVariant}>{highlightLabel}</Badge>}
                {isRetained && <Badge variant="neutral">Retained</Badge>}
              </div>
              <div className="flex items-center gap-2">
                <div className="text-xs font-mono tabular-nums text-text-primary">
                  cos:{' '}
                  <span
                    className={
                      accent === 'violet'
                        ? 'font-semibold text-brand-teal'
                        : 'font-semibold text-brand-navy'
                    }
                  >
                    {formatNumber(item.cosine_similarity, 4)}
                  </span>
                </div>
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() => setExpandedKey(isExpanded ? null : key)}
                  className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md border border-border bg-background-surface text-[10px] font-mono text-text-secondary hover:text-brand-navy"
                >
                  <span>Inspect</span>
                  {isExpanded ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                </button>
              </div>
            </div>

            <p className="text-xs text-text-primary leading-relaxed">{item.text}</p>

            <div className="mt-2.5 flex items-center justify-between gap-3">
              <div className="flex-1 h-1.5 rounded-full bg-background-elevated overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-300',
                    accent === 'violet' ? 'bg-brand-teal' : 'bg-brand-slate'
                  )}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              <span className="text-[10px] font-mono text-text-muted shrink-0">
                d₃₈₄={formatNumber(item.euclidean_distance, 3)} &bull;{' '}
                {formatCoordinates(item.coordinates, 2)}
              </span>
            </div>

            {isExpanded && (
              <div className="mt-3 pt-2.5 border-t border-border-subtle flex flex-wrap items-center justify-between gap-2 text-[11px] text-text-secondary">
                <div className="font-mono space-x-3">
                  <span>cos_384D={formatNumber(item.cosine_similarity, 6)}</span>
                  <span>euclid_384D={formatNumber(item.euclidean_distance, 6)}</span>
                  <span>umap_3d={formatCoordinates(item.coordinates, 4)}</span>
                </div>
                {onSelectForSteering && (
                  <button
                    type="button"
                    onClick={() => onSelectForSteering(item)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border bg-background-surface text-[11px] font-medium text-brand-navy hover:border-brand-slate/60 transition-colors"
                  >
                    <SlidersHorizontal className="w-3 h-3 text-brand-teal" />
                    <span>Steer Sentence</span>
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
