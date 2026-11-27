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
      line: { color: '#38bdf8', width: 3 },
      marker: { size: 8, color: '#38bdf8', line: { width: 1.5, color: '#090d16' } },
    },
    {
      type: 'scatter',
      mode: 'lines',
      name: 'Baseline Score (λ=0)',
      x: sorted.map((s) => s.strength),
      y: sorted.map(() => baseConceptScore),
      hoverinfo: 'skip',
      line: { color: '#94a3b8', width: 1.5, dash: 'dash' },
    },
  ];

  const layout: Partial<Layout> = {
    uirevision: 'eval-concept',
    margin: { l: 56, r: 24, t: 24, b: 48 },
    xaxis: {
      title: { text: 'Steering Strength (λ)' },
      gridcolor: '#172033',
      zerolinecolor: '#475569',
      zerolinewidth: 1.5,
      color: '#94a3b8',
    },
    yaxis: {
      title: { text: 'Concept Alignment Score' },
      gridcolor: '#172033',
      zerolinecolor: '#334155',
      color: '#94a3b8',
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
      line: { color: '#10b981', width: 2.5 },
      marker: { size: 7, color: '#10b981' },
    },
    {
      type: 'scatter',
      mode: 'lines+markers',
      name: 'Neighbor Stability (Jaccard)',
      x: sorted.map((s) => s.strength),
      y: sorted.map((s) => s.neighbor_stability),
      hovertemplate: 'λ = %{x:.2f}<br>Neighbor Stability = %{y:.4f}<extra></extra>',
      line: { color: '#a855f7', width: 2.5 },
      marker: { size: 7, color: '#a855f7', symbol: 'diamond' },
    },
  ];

  const layout: Partial<Layout> = {
    uirevision: 'eval-preservation',
    margin: { l: 56, r: 24, t: 24, b: 48 },
    xaxis: {
      title: { text: 'Steering Strength (λ)' },
      gridcolor: '#172033',
      zerolinecolor: '#475569',
      zerolinewidth: 1.5,
      color: '#94a3b8',
    },
    yaxis: {
      title: { text: 'Retention Ratio (0.0 – 1.0)' },
      range: [-0.05, 1.08],
      gridcolor: '#172033',
      zerolinecolor: '#334155',
      color: '#94a3b8',
    },
  };

  return <PlotlyChart data={data} layout={layout} heightClassName="h-[340px]" />;
};
