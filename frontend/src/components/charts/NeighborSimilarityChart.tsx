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
        marker: { color: '#3E5C8A', opacity: 0.9 },
      },
      {
        type: 'bar',
        name: 'Steered Neighbors',
        x: ranks,
        y: ranks.map((_, i) => steeredNeighbors[i]?.cosine_similarity ?? null),
        text: ranks.map((_, i) => steeredNeighbors[i]?.id ?? ''),
        hovertemplate: '<b>Steered %{x}</b> (%{text})<br>Cosine Similarity: %{y:.4f}<extra></extra>',
        marker: { color: '#0F766E', opacity: 0.9 },
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

  const dataRevision = `${originalNeighbors.map((n) => n.id).join(',')}|${steeredNeighbors
    .map((n) => n.id)
    .join(',')}`;

  const layout: Partial<Layout> = {
    barmode: 'group',
    uirevision: `neighbor-sim:${maxLen}`,
    datarevision: dataRevision,
    margin: { l: 52, r: 20, t: 28, b: 48 },
    xaxis: {
      title: { text: 'Nearest Neighbor Rank' },
      gridcolor: '#ECEAE3',
      color: '#475569',
    },
    yaxis: {
      title: { text: 'Cosine Similarity (384D)' },
      range: hasNegative ? [-1.05, 1.05] : [0, 1.05],
      zerolinecolor: '#CBD5E1',
      gridcolor: '#ECEAE3',
      color: '#475569',
    },
  };

  return <PlotlyChart data={data} layout={layout} heightClassName={heightClassName} />;
};
