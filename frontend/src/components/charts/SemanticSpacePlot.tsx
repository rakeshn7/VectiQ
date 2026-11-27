import React, { useMemo } from 'react';
import { Compass } from 'lucide-react';
import type { Data, Layout, PlotMouseEvent } from 'plotly.js';
import { PlotlyChart } from '@/components/charts/PlotlyChart';
import { EmptyState } from '@/components/ui';
import type {
  Coordinate3D,
  EvaluationStep,
  NearestNeighborItem,
  SemanticMapPoint,
  SemanticMapResponse,
} from '@/types/api';
import { formatNumber, formatSigned } from '@/utils/format';

export type SpaceViewMode = '2d' | '3d';

export interface HighlightPoint {
  label: string;
  text: string;
  coordinates: Coordinate3D;
  conceptScore?: number;
}

export interface SemanticSpacePlotProps {
  mode: SpaceViewMode;
  semanticMap?: SemanticMapResponse | null;
  visiblePoints?: SemanticMapPoint[];
  selectedCorpusPointId?: string | null;
  onSelectCorpusPoint?: (pointId: string) => void;
  originalPoint?: HighlightPoint | null;
  steeredPoint?: HighlightPoint | null;
  originalNeighbors?: NearestNeighborItem[];
  steeredNeighbors?: NearestNeighborItem[];
  trajectorySteps?: EvaluationStep[];
  title?: string;
  heightClassName?: string;
  emptyTitle?: string;
  emptyDescription?: string;
}

function truncateText(text: string | undefined | null, maxLen = 72): string {
  if (!text) return '';
  return text.length > maxLen ? `${text.slice(0, maxLen - 1)}…` : text;
}

export const SemanticSpacePlot: React.FC<SemanticSpacePlotProps> = ({
  mode,
  semanticMap,
  visiblePoints,
  selectedCorpusPointId,
  onSelectCorpusPoint,
  originalPoint,
  steeredPoint,
  originalNeighbors,
  steeredNeighbors,
  trajectorySteps,
  title,
  heightClassName = 'h-[460px]',
  emptyTitle = 'No Semantic Points to Display',
  emptyDescription = 'No coordinates match the current view or filter criteria.',
}) => {
  const is3D = mode === '3d';

  const traces = useMemo<Data[]>(() => {
    const result: Data[] = [];
    const points = visiblePoints ?? semanticMap?.points ?? [];
    const clusters = semanticMap?.clusters ?? [];

    // 1. Background corpus clusters
    if (points.length > 0) {
      const grouped = new Map<string, SemanticMapPoint[]>();
      for (const pt of points) {
        const key = pt.category || 'uncategorized';
        const list = grouped.get(key) ?? [];
        list.push(pt);
        grouped.set(key, list);
      }

      grouped.forEach((groupPoints, category) => {
        const clusterMeta = clusters.find((c) => c.id === category);
        const color = clusterMeta?.color || '#64748b';
        const label = clusterMeta?.label || category;

        const hoverTexts = groupPoints.map(
          (p) =>
            `<b>${label}</b><br>` +
            `${truncateText(p.text)}<br>` +
            `Coords: (${formatNumber(p.coordinates?.x, 3)}, ${formatNumber(p.coordinates?.y, 3)}, ${formatNumber(p.coordinates?.z, 3)})<br>` +
            `Sentiment: ${formatNumber(p.concept_scores?.positive_sentiment, 3)} | Tech: ${formatNumber(p.concept_scores?.technical_tone, 3)} | Formal: ${formatNumber(p.concept_scores?.formal_tone, 3)}`
        );

        if (is3D) {
          result.push({
            type: 'scatter3d',
            mode: 'markers',
            name: label,
            x: groupPoints.map((p) => p.coordinates.x),
            y: groupPoints.map((p) => p.coordinates.y),
            z: groupPoints.map((p) => p.coordinates.z),
            text: hoverTexts,
            customdata: groupPoints.map((p) => p.id),
            hovertemplate: '%{text}<extra></extra>',
            marker: {
              size: 5,
              color,
              opacity: originalPoint || steeredPoint || trajectorySteps?.length ? 0.35 : 0.82,
            },
          });
        } else {
          result.push({
            type: 'scatter',
            mode: 'markers',
            name: label,
            x: groupPoints.map((p) => p.coordinates.x),
            y: groupPoints.map((p) => p.coordinates.y),
            text: hoverTexts,
            customdata: groupPoints.map((p) => p.id),
            hovertemplate: '%{text}<extra></extra>',
            marker: {
              size: 8,
              color,
              opacity: originalPoint || steeredPoint || trajectorySteps?.length ? 0.35 : 0.85,
              line: { width: 1, color: '#090d16' },
            },
          });
        }
      });
    }

    // 2. Selected corpus point highlight
    if (selectedCorpusPointId && points.length > 0) {
      const selected = points.find((p) => p.id === selectedCorpusPointId);
      if (selected) {
        const hover =
          `<b>Selected Corpus Point (${selected.id})</b><br>` +
          `${truncateText(selected.text)}<br>` +
          `(${formatNumber(selected.coordinates?.x, 3)}, ${formatNumber(selected.coordinates?.y, 3)}, ${formatNumber(selected.coordinates?.z, 3)})`;

        if (is3D) {
          result.push({
            type: 'scatter3d',
            mode: 'markers',
            name: 'Selected Point',
            x: [selected.coordinates.x],
            y: [selected.coordinates.y],
            z: [selected.coordinates.z],
            text: [hover],
            hovertemplate: '%{text}<extra></extra>',
            marker: {
              size: 9,
              color: '#f8fafc',
              symbol: 'diamond',
              line: { width: 2, color: '#38bdf8' },
            },
          });
        } else {
          result.push({
            type: 'scatter',
            mode: 'markers',
            name: 'Selected Point',
            x: [selected.coordinates.x],
            y: [selected.coordinates.y],
            text: [hover],
            hovertemplate: '%{text}<extra></extra>',
            marker: {
              size: 14,
              color: 'rgba(56, 189, 248, 0.25)',
              symbol: 'circle',
              line: { width: 2.5, color: '#f8fafc' },
            },
          });
        }
      }
    }

    // 3. Nearest neighbor highlights
    if (originalNeighbors && originalNeighbors.length > 0) {
      const hover = originalNeighbors.map(
        (n) =>
          `<b>Original Neighbor (${n.category})</b><br>${truncateText(n.text)}<br>Cosine Sim: ${formatNumber(n.cosine_similarity, 4)}`
      );
      if (is3D) {
        result.push({
          type: 'scatter3d',
          mode: 'markers',
          name: 'Original Neighbors',
          x: originalNeighbors.map((n) => n.coordinates.x),
          y: originalNeighbors.map((n) => n.coordinates.y),
          z: originalNeighbors.map((n) => n.coordinates.z),
          text: hover,
          hovertemplate: '%{text}<extra></extra>',
          marker: { size: 6, color: '#0ea5e9', symbol: 'circle-open' },
        });
      } else {
        result.push({
          type: 'scatter',
          mode: 'markers',
          name: 'Original Neighbors',
          x: originalNeighbors.map((n) => n.coordinates.x),
          y: originalNeighbors.map((n) => n.coordinates.y),
          text: hover,
          hovertemplate: '%{text}<extra></extra>',
          marker: {
            size: 11,
            color: 'rgba(14, 165, 233, 0.2)',
            line: { width: 2, color: '#38bdf8' },
          },
        });
      }
    }

    if (steeredNeighbors && steeredNeighbors.length > 0) {
      const hover = steeredNeighbors.map(
        (n) =>
          `<b>Steered Neighbor (${n.category})</b><br>${truncateText(n.text)}<br>Cosine Sim: ${formatNumber(n.cosine_similarity, 4)}`
      );
      if (is3D) {
        result.push({
          type: 'scatter3d',
          mode: 'markers',
          name: 'Steered Neighbors',
          x: steeredNeighbors.map((n) => n.coordinates.x),
          y: steeredNeighbors.map((n) => n.coordinates.y),
          z: steeredNeighbors.map((n) => n.coordinates.z),
          text: hover,
          hovertemplate: '%{text}<extra></extra>',
          marker: { size: 6, color: '#a855f7', symbol: 'diamond-open' },
        });
      } else {
        result.push({
          type: 'scatter',
          mode: 'markers',
          name: 'Steered Neighbors',
          x: steeredNeighbors.map((n) => n.coordinates.x),
          y: steeredNeighbors.map((n) => n.coordinates.y),
          text: hover,
          hovertemplate: '%{text}<extra></extra>',
          marker: {
            size: 11,
            color: 'rgba(168, 85, 247, 0.2)',
            symbol: 'diamond',
            line: { width: 2, color: '#a855f7' },
          },
        });
      }
    }

    // 4. Multi-step Evaluation Trajectory
    if (trajectorySteps && trajectorySteps.length > 0) {
      const sorted = [...trajectorySteps].sort((a, b) => a.strength - b.strength);
      const hover = sorted.map(
        (s) =>
          `<b>λ = ${formatSigned(s.strength, 2)}</b><br>` +
          `Concept Score: ${formatNumber(s.concept_score, 4)}<br>` +
          `Preservation: ${formatNumber(s.semantic_preservation, 4)}<br>` +
          `Coords: (${formatNumber(s.coordinates?.x, 3)}, ${formatNumber(s.coordinates?.y, 3)}, ${formatNumber(s.coordinates?.z, 3)})`
      );

      if (is3D) {
        result.push({
          type: 'scatter3d',
          mode: 'lines+markers',
          name: 'Steering Trajectory',
          x: sorted.map((s) => s.coordinates.x),
          y: sorted.map((s) => s.coordinates.y),
          z: sorted.map((s) => s.coordinates.z),
          text: hover,
          hovertemplate: '%{text}<extra></extra>',
          line: { width: 4, color: '#38bdf8' },
          marker: {
            size: 6,
            color: sorted.map((s) => s.strength),
            colorscale: 'Portland',
            showscale: false,
          },
        });
      } else {
        result.push({
          type: 'scatter',
          mode: 'text+lines+markers',
          name: 'Steering Trajectory',
          x: sorted.map((s) => s.coordinates.x),
          y: sorted.map((s) => s.coordinates.y),
          text: sorted.map((s) => formatSigned(s.strength, 2)),
          hovertext: hover,
          hovertemplate: '%{hovertext}<extra></extra>',
          textposition: 'top center',
          textfont: { size: 10, color: '#cbd5e1', family: 'JetBrains Mono, monospace' },
          line: { width: 2.5, color: '#38bdf8', dash: 'dot' },
          marker: {
            size: 10,
            color: sorted.map((s) => s.strength),
            colorscale: [
              [0, '#38bdf8'],
              [0.5, '#f8fafc'],
              [1, '#a855f7'],
            ],
            line: { width: 1.5, color: '#090d16' },
          },
        });
      }
    }

    // 5. Vector Movement Line between Original and Steered
    if (originalPoint && steeredPoint) {
      if (is3D) {
        result.push({
          type: 'scatter3d',
          mode: 'lines',
          name: 'Movement Vector',
          x: [originalPoint.coordinates.x, steeredPoint.coordinates.x],
          y: [originalPoint.coordinates.y, steeredPoint.coordinates.y],
          z: [originalPoint.coordinates.z, steeredPoint.coordinates.z],
          hoverinfo: 'skip',
          line: { width: 5, color: '#f59e0b', dash: 'dash' },
        });
      } else {
        result.push({
          type: 'scatter',
          mode: 'lines',
          name: 'Movement Vector',
          x: [originalPoint.coordinates.x, steeredPoint.coordinates.x],
          y: [originalPoint.coordinates.y, steeredPoint.coordinates.y],
          hoverinfo: 'skip',
          line: { width: 2.5, color: '#f59e0b', dash: 'dash' },
        });
      }
    }

    // 6. Original Point Marker
    if (originalPoint) {
      const hover =
        `<b>${originalPoint.label}</b><br>` +
        `${truncateText(originalPoint.text)}<br>` +
        `Coords: (${formatNumber(originalPoint.coordinates?.x, 3)}, ${formatNumber(originalPoint.coordinates?.y, 3)}, ${formatNumber(originalPoint.coordinates?.z, 3)})` +
        (originalPoint.conceptScore !== undefined
          ? `<br>Concept Score: ${formatNumber(originalPoint.conceptScore, 4)}`
          : '');

      if (is3D) {
        result.push({
          type: 'scatter3d',
          mode: 'markers',
          name: originalPoint.label,
          x: [originalPoint.coordinates.x],
          y: [originalPoint.coordinates.y],
          z: [originalPoint.coordinates.z],
          text: [hover],
          hovertemplate: '%{text}<extra></extra>',
          marker: {
            size: 10,
            color: '#38bdf8',
            symbol: 'circle',
            line: { width: 2, color: '#f8fafc' },
          },
        });
      } else {
        result.push({
          type: 'scatter',
          mode: 'text+markers',
          name: originalPoint.label,
          x: [originalPoint.coordinates.x],
          y: [originalPoint.coordinates.y],
          text: [originalPoint.label],
          hovertext: [hover],
          hovertemplate: '%{hovertext}<extra></extra>',
          textposition: 'bottom center',
          textfont: { size: 11, color: '#38bdf8', family: 'Inter, sans-serif' },
          marker: {
            size: 14,
            color: '#38bdf8',
            symbol: 'circle',
            line: { width: 2.5, color: '#f8fafc' },
          },
        });
      }
    }

    // 7. Steered Point Marker
    if (steeredPoint) {
      const hover =
        `<b>${steeredPoint.label}</b><br>` +
        `${truncateText(steeredPoint.text)}<br>` +
        `Coords: (${formatNumber(steeredPoint.coordinates?.x, 3)}, ${formatNumber(steeredPoint.coordinates?.y, 3)}, ${formatNumber(steeredPoint.coordinates?.z, 3)})` +
        (steeredPoint.conceptScore !== undefined
          ? `<br>Concept Score: ${formatNumber(steeredPoint.conceptScore, 4)}`
          : '');

      if (is3D) {
        result.push({
          type: 'scatter3d',
          mode: 'markers',
          name: steeredPoint.label,
          x: [steeredPoint.coordinates.x],
          y: [steeredPoint.coordinates.y],
          z: [steeredPoint.coordinates.z],
          text: [hover],
          hovertemplate: '%{text}<extra></extra>',
          marker: {
            size: 10,
            color: '#a855f7',
            symbol: 'diamond',
            line: { width: 2, color: '#f8fafc' },
          },
        });
      } else {
        result.push({
          type: 'scatter',
          mode: 'text+markers',
          name: steeredPoint.label,
          x: [steeredPoint.coordinates.x],
          y: [steeredPoint.coordinates.y],
          text: [steeredPoint.label],
          hovertext: [hover],
          hovertemplate: '%{hovertext}<extra></extra>',
          textposition: 'top center',
          textfont: { size: 11, color: '#c084fc', family: 'Inter, sans-serif' },
          marker: {
            size: 14,
            color: '#a855f7',
            symbol: 'diamond',
            line: { width: 2.5, color: '#f8fafc' },
          },
        });
      }
    }

    return result;
  }, [
    visiblePoints,
    semanticMap,
    selectedCorpusPointId,
    originalPoint,
    steeredPoint,
    originalNeighbors,
    steeredNeighbors,
    trajectorySteps,
    is3D,
  ]);

  const layout = useMemo<Partial<Layout>>(() => {
    const base: Partial<Layout> = {
      uirevision: mode,
      title: title
        ? {
            text: title,
            font: { size: 13, color: '#e2e8f0' },
            x: 0.02,
          }
        : undefined,
      margin: is3D
        ? { l: 0, r: 0, t: title ? 36 : 12, b: 0 }
        : { l: 52, r: 24, t: title ? 40 : 18, b: 48 },
      dragmode: is3D ? 'orbit' : 'pan',
    };

    if (is3D) {
      base.scene = {
        bgcolor: '#090d16',
        xaxis: {
          title: { text: 'UMAP X' },
          gridcolor: '#1e293b',
          zerolinecolor: '#334155',
          color: '#94a3b8',
        },
        yaxis: {
          title: { text: 'UMAP Y' },
          gridcolor: '#1e293b',
          zerolinecolor: '#334155',
          color: '#94a3b8',
        },
        zaxis: {
          title: { text: 'UMAP Z' },
          gridcolor: '#1e293b',
          zerolinecolor: '#334155',
          color: '#94a3b8',
        },
      };
    } else {
      base.xaxis = {
        title: { text: 'UMAP Dimension 1 (X)' },
        gridcolor: '#172033',
        zerolinecolor: '#334155',
        color: '#94a3b8',
      };
      base.yaxis = {
        title: { text: 'UMAP Dimension 2 (Y)' },
        gridcolor: '#172033',
        zerolinecolor: '#334155',
        color: '#94a3b8',
      };

      if (
        originalPoint &&
        steeredPoint &&
        (Math.abs(originalPoint.coordinates.x - steeredPoint.coordinates.x) > 1e-6 ||
          Math.abs(originalPoint.coordinates.y - steeredPoint.coordinates.y) > 1e-6)
      ) {
        base.annotations = [
          {
            x: steeredPoint.coordinates.x,
            y: steeredPoint.coordinates.y,
            ax: originalPoint.coordinates.x,
            ay: originalPoint.coordinates.y,
            xref: 'x',
            yref: 'y',
            axref: 'x',
            ayref: 'y',
            showarrow: true,
            arrowhead: 3,
            arrowsize: 1.2,
            arrowwidth: 2,
            arrowcolor: '#f59e0b',
          },
        ];
      }
    }

    return base;
  }, [is3D, mode, title, originalPoint, steeredPoint]);

  if (traces.length === 0) {
    return (
      <EmptyState
        icon={<Compass className="w-5 h-5" />}
        title={emptyTitle}
        description={emptyDescription}
        className={heightClassName}
      />
    );
  }

  const handleClick = (event: Readonly<PlotMouseEvent>) => {
    if (!onSelectCorpusPoint || !event.points || event.points.length === 0) return;
    const customId = event.points[0].customdata;
    if (typeof customId === 'string') {
      onSelectCorpusPoint(customId);
    }
  };

  return (
    <PlotlyChart
      data={traces}
      layout={layout}
      onClick={onSelectCorpusPoint ? handleClick : undefined}
      heightClassName={heightClassName}
    />
  );
};
