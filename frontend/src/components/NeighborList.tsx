import React from 'react';
import { Badge } from '@/components/ui';
import type { NearestNeighborItem } from '@/types/api';
import { formatCoordinates, formatNumber } from '@/utils/format';
import { cn } from '@/utils/cn';

export interface NeighborListProps {
  items: NearestNeighborItem[];
  accent?: 'cyan' | 'violet';
  highlightIds?: Set<string>;
  highlightLabel?: string;
  emptyText?: string;
}

export const NeighborList: React.FC<NeighborListProps> = ({
  items,
  accent = 'cyan',
  highlightIds,
  highlightLabel = 'New Neighbor',
  emptyText = 'No nearest neighbors returned.',
}) => {
  if (!items || items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-text-muted">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {items.map((item, idx) => {
        const isHighlighted = highlightIds?.has(item.id) ?? false;
        const barWidth = Math.max(0, Math.min(100, item.cosine_similarity * 100));

        return (
          <div
            key={`${item.id}-${idx}`}
            className={cn(
              'rounded-lg border p-3 bg-background/70 transition-colors',
              isHighlighted
                ? 'border-accent-violet/45 bg-accent-violet/5'
                : 'border-border/80'
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-text-muted">#{idx + 1}</span>
                <span className="text-xs font-mono text-text-secondary">{item.id}</span>
                <Badge variant={accent === 'violet' ? 'violet' : 'cyan'}>{item.category}</Badge>
                {isHighlighted && <Badge variant="amber">{highlightLabel}</Badge>}
              </div>
              <div className="text-xs font-mono tabular-nums text-text-primary">
                cos: <span className={accent === 'violet' ? 'text-purple-300' : 'text-accent-cyan'}>{formatNumber(item.cosine_similarity, 4)}</span>
              </div>
            </div>

            <p className="text-xs text-text-primary leading-relaxed">{item.text}</p>

            <div className="mt-2.5 flex items-center justify-between gap-3">
              <div className="flex-1 h-1.5 rounded-full bg-background-elevated overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full',
                    accent === 'violet' ? 'bg-accent-violet' : 'bg-accent-cyan'
                  )}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              <span className="text-[10px] font-mono text-text-muted shrink-0">
                d₃₈₄={formatNumber(item.euclidean_distance, 3)} &bull; {formatCoordinates(item.coordinates, 2)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
