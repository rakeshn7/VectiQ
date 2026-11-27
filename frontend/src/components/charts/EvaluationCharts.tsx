import React, { useMemo } from 'react';
import type { Data, Layout } from 'plotly.js';
import { PlotlyChart } from '@/components/charts/PlotlyChart';
import { EmptyState } from '@/components/ui';
import type { EvaluationStep } from '@/types/api';

export interface EvaluationChartsProps {
  steps: EvaluationStep[];
  baseConceptScore: number;
}

export const ConceptProgressionChart: React.FC<EvaluationChartsProps> = ({
  steps,
  baseConceptScore,
}) => {
  const sorted = useMemo(
    () => [...steps].sort((a, b) => a.strength - b.strength),
    [steps]
  );

  if (sorted.length === 0) {
    return (
      <EmptyState
        title="No Evaluation Steps Returned"
        description="Backend returned an empty step list for this evaluation."
        className="h-[340px]"
      />
    );
  }

  const data: Data[] = [
    {
      type: 'scatter',
      mode: 'lines+markers',
      name: 'Concept Score',
      x: sorted.map((s) => s.strength),
      y: sorted.map((s) => s.concept_score),
      hovertemplate: 'Strength λ = %{x:.2f}<br>Concept Score = %{y:.4f}<extra></extra>',
      line: { color: '#1B2E4B', width: 3 },
      marker: { size: 8, color: '#0F766E', line: { width: 1.5, color: '#FFFFFF' } },
    },
    {
      type: 'scatter',
      mode: 'lines',
      name: 'Baseline Score (λ=0)',
      x: sorted.map((s) => s.strength),
      y: sorted.map(() => baseConceptScore),
      hoverinfo: 'skip',
      line: { color: '#64748B', width: 1.5, dash: 'dash' },
    },
  ];

  const dataRevision = sorted.map((s) => `${s.strength}:${s.concept_score}`).join('|');

  const layout: Partial<Layout> = {
    uirevision: `eval-concept:${baseConceptScore}:${sorted.length}`,
    datarevision: dataRevision,
    margin: { l: 56, r: 24, t: 24, b: 48 },
    xaxis: {
      title: { text: 'Steering Strength (λ)' },
      gridcolor: '#ECEAE3',
      zerolinecolor: '#CBD5E1',
      zerolinewidth: 1.5,
      color: '#475569',
    },
    yaxis: {
      title: { text: 'Concept Alignment Score' },
      gridcolor: '#ECEAE3',
      zerolinecolor: '#CBD5E1',
      color: '#475569',
    },
  };

  return <PlotlyChart data={data} layout={layout} heightClassName="h-[340px]" />;
};

export const PreservationStabilityChart: React.FC<{ steps: EvaluationStep[] }> = ({ steps }) => {
  const sorted = useMemo(
    () => [...steps].sort((a, b) => a.strength - b.strength),
    [steps]
  );

  if (sorted.length === 0) {
    return (
      <EmptyState
        title="No Evaluation Steps Returned"
        description="Backend returned an empty step list for this evaluation."
        className="h-[340px]"
      />
    );
  }

  const data: Data[] = [
    {
      type: 'scatter',
      mode: 'lines+markers',
      name: 'Semantic Preservation',
      x: sorted.map((s) => s.strength),
      y: sorted.map((s) => s.semantic_preservation),
      hovertemplate: 'λ = %{x:.2f}<br>Preservation = %{y:.4f}<extra></extra>',
      line: { color: '#0F766E', width: 2.5 },
      marker: { size: 7, color: '#0F766E', line: { width: 1, color: '#FFFFFF' } },
    },
    {
      type: 'scatter',
      mode: 'lines+markers',
      name: 'Neighbor Stability (Jaccard)',
      x: sorted.map((s) => s.strength),
      y: sorted.map((s) => s.neighbor_stability),
      hovertemplate: 'λ = %{x:.2f}<br>Neighbor Stability = %{y:.4f}<extra></extra>',
      line: { color: '#3E5C8A', width: 2.5 },
      marker: { size: 7, color: '#3E5C8A', symbol: 'diamond', line: { width: 1, color: '#FFFFFF' } },
    },
  ];

  const dataRevision = sorted
    .map((s) => `${s.strength}:${s.semantic_preservation}:${s.neighbor_stability}`)
    .join('|');

  const layout: Partial<Layout> = {
    uirevision: `eval-preservation:${sorted.length}`,
    datarevision: dataRevision,
    margin: { l: 56, r: 24, t: 24, b: 48 },
    xaxis: {
      title: { text: 'Steering Strength (λ)' },
      gridcolor: '#ECEAE3',
      zerolinecolor: '#CBD5E1',
      zerolinewidth: 1.5,
      color: '#475569',
    },
    yaxis: {
      title: { text: 'Retention Ratio (0.0 – 1.0)' },
      range: [-0.05, 1.08],
      gridcolor: '#ECEAE3',
      zerolinecolor: '#CBD5E1',
      color: '#475569',
    },
  };

  return <PlotlyChart data={data} layout={layout} heightClassName="h-[340px]" />;
};

export const DisplacementDriftChart: React.FC<{ steps: EvaluationStep[] }> = ({ steps }) => {
  const sorted = useMemo(
    () => [...steps].sort((a, b) => a.strength - b.strength),
    [steps]
  );

  const baselineCoords = useMemo(() => {
    const zero = sorted.find((s) => Math.abs(s.strength) < 1e-9);
    return zero?.coordinates ?? null;
  }, [sorted]);

  if (sorted.length === 0) {
    return (
      <EmptyState
        title="No Evaluation Steps Returned"
        description="Backend returned an empty step list for this evaluation."
        className="h-[340px]"
      />
    );
  }

  const cosineDriftValues = sorted.map((s) =>
    Number.isFinite(s.semantic_preservation) ? Math.max(0, 1 - s.semantic_preservation) : null
  );

  const data: Data[] = [
    {
      type: 'scatter',
      mode: 'lines+markers',
      name: '384D Cosine Drift (1 − cos)',
      x: sorted.map((s) => s.strength),
      y: cosineDriftValues,
      hovertemplate: 'λ = %{x:.2f}<br>Cosine Drift = %{y:.4f}<extra></extra>',
      line: { color: '#1B2E4B', width: 2.5 },
      marker: { size: 7, color: '#1B2E4B', line: { width: 1, color: '#FFFFFF' } },
      yaxis: 'y',
    },
  ];

  if (baselineCoords) {
    const umapShifts = sorted.map((s) => {
      if (
        !s.coordinates ||
        !Number.isFinite(s.coordinates.x) ||
        !Number.isFinite(s.coordinates.y) ||
        !Number.isFinite(s.coordinates.z)
      ) {
        return null;
      }
      const dx = s.coordinates.x - baselineCoords.x;
      const dy = s.coordinates.y - baselineCoords.y;
      const dz = s.coordinates.z - baselineCoords.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    });

    data.push({
      type: 'scatter',
      mode: 'lines+markers',
      name: 'UMAP Projected Shift (3D)',
      x: sorted.map((s) => s.strength),
      y: umapShifts,
      hovertemplate: 'λ = %{x:.2f}<br>UMAP 3D Shift = %{y:.3f}<extra></extra>',
      line: { color: '#B45309', width: 2, dash: 'dot' },
      marker: { size: 6.5, color: '#B45309', symbol: 'diamond' },
      yaxis: 'y2',
    });
  }

  const dataRevision = sorted
    .map((s) => `${s.strength}:${s.semantic_preservation}:${s.coordinates?.x ?? 'na'}`)
    .join('|');

  const layout: Partial<Layout> = {
    uirevision: `eval-displacement:${sorted.length}:${baselineCoords ? 'with-umap' : 'cos-only'}`,
    datarevision: dataRevision,
    margin: { l: 56, r: baselineCoords ? 56 : 24, t: 24, b: 48 },
    xaxis: {
      title: { text: 'Steering Strength (λ)' },
      gridcolor: '#ECEAE3',
      zerolinecolor: '#CBD5E1',
      zerolinewidth: 1.5,
      color: '#475569',
    },
    yaxis: {
      title: { text: '384D Cosine Drift (1 − cos)' },
      gridcolor: '#ECEAE3',
      zerolinecolor: '#CBD5E1',
      color: '#1B2E4B',
    },
    ...(baselineCoords
      ? {
          yaxis2: {
            title: { text: 'UMAP Shift (3D Units)' },
            overlaying: 'y' as const,
            side: 'right' as const,
            showgrid: false,
            color: '#B45309',
          },
        }
      : {}),
  };

  return <PlotlyChart data={data} layout={layout} heightClassName="h-[340px]" />;
};
