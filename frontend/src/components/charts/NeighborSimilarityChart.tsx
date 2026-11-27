import React, { useMemo } from 'react';
import type { Data, Layout } from 'plotly.js';
import { PlotlyChart } from '@/components/charts/PlotlyChart';
import { EmptyState } from '@/components/ui';
import type { NearestNeighborItem } from '@/types/api';

export interface NeighborSimilarityChartProps {
  originalNeighbors: NearestNeighborItem[];
  steeredNeighbors: NearestNeighborItem[];
  heightClassName?: string;
}

export const NeighborSimilarityChart: React.FC<NeighborSimilarityChartProps> = ({
  originalNeighbors,
  steeredNeighbors,
  heightClassName = 'h-[340px]',
}) => {
  const maxLen = Math.max(originalNeighbors.length, steeredNeighbors.length);

  const data = useMemo<Data[]>(() => {
    if (maxLen === 0) return [];
    const ranks = Array.from({ length: maxLen }, (_, idx) => `Rank #${idx + 1}`);

    return [
      {
        type: 'bar',
        name: 'Original Neighbors',
        x: ranks,
        y: ranks.map((_, i) => originalNeighbors[i]?.cosine_similarity ?? null),
        text: ranks.map((_, i) => originalNeighbors[i]?.id ?? ''),
        hovertemplate: '<b>Original %{x}</b> (%{text})<br>Cosine Similarity: %{y:.4f}<extra></extra>',
        marker: { color: '#38bdf8', opacity: 0.85 },
      },
      {
        type: 'bar',
        name: 'Steered Neighbors',
        x: ranks,
        y: ranks.map((_, i) => steeredNeighbors[i]?.cosine_similarity ?? null),
        text: ranks.map((_, i) => steeredNeighbors[i]?.id ?? ''),
        hovertemplate: '<b>Steered %{x}</b> (%{text})<br>Cosine Similarity: %{y:.4f}<extra></extra>',
        marker: { color: '#a855f7', opacity: 0.85 },
      },
    ];
  }, [maxLen, originalNeighbors, steeredNeighbors]);

  const hasNegative = useMemo(() => {
    const allSims = [
      ...originalNeighbors.map((n) => n.cosine_similarity),
      ...steeredNeighbors.map((n) => n.cosine_similarity),
    ];
    return allSims.some((s) => s < 0);
  }, [originalNeighbors, steeredNeighbors]);

  if (maxLen === 0) {
    return (
      <EmptyState
        title="No Neighbor Similarity Data"
        description="Nearest neighbors were not returned for this comparison run."
        className={heightClassName}
      />
    );
  }

  const layout: Partial<Layout> = {
    barmode: 'group',
    uirevision: 'neighbor-sim',
    margin: { l: 52, r: 20, t: 28, b: 48 },
    xaxis: {
      title: { text: 'Nearest Neighbor Rank' },
      gridcolor: '#172033',
      color: '#94a3b8',
    },
    yaxis: {
      title: { text: 'Cosine Similarity (384D)' },
      range: hasNegative ? [-1.05, 1.05] : [0, 1.05],
      zerolinecolor: '#334155',
      gridcolor: '#172033',
      color: '#94a3b8',
    },
  };

  return <PlotlyChart data={data} layout={layout} heightClassName={heightClassName} />;
};
