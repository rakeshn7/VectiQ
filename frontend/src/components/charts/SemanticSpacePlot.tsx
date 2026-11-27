import React, { useMemo, useState } from 'react';
import { Compass, Focus, Globe, RotateCcw } from 'lucide-react';
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
  onResetView?: () => void;
}

function truncateText(text: string | undefined | null, maxLen = 72): string {
  if (!text) return '';
  return text.length > maxLen ? `${text.slice(0, maxLen - 1)}…` : text;
}

function computeAxisBounds(values: number[], minSpan = 1.2): [number, number] {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return [0, 1];
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const span = max - min;
  const pad = Math.max(span * 0.25, minSpan * 0.5);
  return [min - pad, max + pad];
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
  onResetView,
}) => {
  const is3D = mode === '3d';
  const [focusActiveVector, setFocusActiveVector] = useState<boolean>(false);
  const [viewResetCount, setViewResetCount] = useState<number>(0);

  const hasActiveOverlay = Boolean(
    originalPoint || steeredPoint || (trajectorySteps && trajectorySteps.length > 0)
  );

  // Build deterministic revision keys so Plotly always re-draws when coordinates/inputs change
  const activeVectorKey = useMemo(() => {
    const origKey = originalPoint
      ? `${originalPoint.coordinates.x}:${originalPoint.coordinates.y}:${originalPoint.coordinates.z}:${originalPoint.text}`
      : 'none';
    const steerKey = steeredPoint
      ? `${steeredPoint.coordinates.x}:${steeredPoint.coordinates.y}:${steeredPoint.coordinates.z}:${steeredPoint.label}`
      : 'none';
    const trajKey = trajectorySteps?.length
      ? `${trajectorySteps.length}:${trajectorySteps[0].coordinates.x}:${trajectorySteps[trajectorySteps.length - 1].coordinates.x}`
      : '0';
    return `${origKey}|${steerKey}|${trajKey}`;
  }, [originalPoint, steeredPoint, trajectorySteps]);

  const dataSignature = useMemo(() => {
    const pts = visiblePoints ?? semanticMap?.points ?? [];
    const ptsKey = `${pts.length}:${pts[0]?.id ?? ''}:${pts[pts.length - 1]?.id ?? ''}`;
    return `${mode}|${focusActiveVector ? 'focus' : 'full'}|${ptsKey}|${selectedCorpusPointId ?? ''}|${activeVectorKey}`;
  }, [mode, focusActiveVector, visiblePoints, semanticMap, selectedCorpusPointId, activeVectorKey]);

  const traces = useMemo<Data[]>(() => {
    const result: Data[] = [];
    const points = visiblePoints ?? semanticMap?.points ?? [];
    const clusters = semanticMap?.clusters ?? [];

    // 1. Background corpus clusters (subdued when an active steering vector or trajectory is overlaid)
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
              size: hasActiveOverlay ? 3.5 : 5,
              color,
              opacity: hasActiveOverlay ? 0.2 : 0.85,
              line: { width: 0.5, color: '#FFFFFF' },
            },
          });
        } else {
          result.push({
            type: points.length > 500 ? 'scattergl' : 'scatter',
            mode: 'markers',
            name: label,
            x: groupPoints.map((p) => p.coordinates.x),
            y: groupPoints.map((p) => p.coordinates.y),
            text: hoverTexts,
            customdata: groupPoints.map((p) => p.id),
            hovertemplate: '%{text}<extra></extra>',
            marker: {
              size: hasActiveOverlay ? 6 : 8,
              color,
              opacity: hasActiveOverlay ? 0.22 : 0.88,
              line: { width: 1, color: '#FFFFFF' },
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
              color: '#1B2E4B',
              symbol: 'diamond',
              line: { width: 2, color: '#FFFFFF' },
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
              color: 'rgba(27, 46, 75, 0.16)',
              symbol: 'circle',
              line: { width: 2.5, color: '#1B2E4B' },
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
          marker: { size: 6, color: '#3E5C8A', symbol: 'circle-open' },
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
            color: 'rgba(62, 92, 138, 0.14)',
            line: { width: 2, color: '#3E5C8A' },
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
          marker: { size: 6, color: '#0F766E', symbol: 'diamond-open' },
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
            color: 'rgba(15, 118, 110, 0.14)',
            symbol: 'diamond',
            line: { width: 2, color: '#0F766E' },
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
          line: { width: 5, color: '#1B2E4B' },
          marker: {
            size: 6.5,
            color: sorted.map((s) => s.strength),
            colorscale: [
              [0, '#3E5C8A'],
              [0.5, '#64748B'],
              [1, '#0F766E'],
            ],
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
          textfont: { size: 10, color: '#132033', family: 'JetBrains Mono, monospace' },
          line: { width: 2.5, color: '#3E5C8A', dash: 'dot' },
          marker: {
            size: 10,
            color: sorted.map((s) => s.strength),
            colorscale: [
              [0, '#3E5C8A'],
              [0.5, '#64748B'],
              [1, '#0F766E'],
            ],
            line: { width: 1.5, color: '#FFFFFF' },
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
          line: { width: 6, color: '#B45309', dash: 'dash' },
        });
      } else {
        result.push({
          type: 'scatter',
          mode: 'lines',
          name: 'Movement Vector',
          x: [originalPoint.coordinates.x, steeredPoint.coordinates.x],
          y: [originalPoint.coordinates.y, steeredPoint.coordinates.y],
          hoverinfo: 'skip',
          line: { width: 2.5, color: '#B45309', dash: 'dash' },
        });
      }
    }

    // Smart label placement so Original & Steered text avoid colliding
    const origTextPos =
      originalPoint && steeredPoint && originalPoint.coordinates.y > steeredPoint.coordinates.y
        ? 'top center'
        : 'bottom center';
    const steerTextPos =
      originalPoint && steeredPoint && steeredPoint.coordinates.y >= originalPoint.coordinates.y
        ? 'top center'
        : 'bottom center';

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
          mode: 'text+markers',
          name: originalPoint.label,
          x: [originalPoint.coordinates.x],
          y: [originalPoint.coordinates.y],
          z: [originalPoint.coordinates.z],
          text: [originalPoint.label],
          hovertext: [hover],
          hovertemplate: '%{hovertext}<extra></extra>',
          textposition: 'top center',
          textfont: { size: 11, color: '#1B2E4B', family: 'Inter, sans-serif' },
          marker: {
            size: 10,
            color: '#1B2E4B',
            symbol: 'circle',
            line: { width: 2, color: '#FFFFFF' },
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
          textposition: origTextPos,
          textfont: { size: 11, color: '#1B2E4B', family: 'Inter, sans-serif' },
          marker: {
            size: 14,
            color: '#1B2E4B',
            symbol: 'circle',
            line: { width: 2.5, color: '#FFFFFF' },
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
          mode: 'text+markers',
          name: steeredPoint.label,
          x: [steeredPoint.coordinates.x],
          y: [steeredPoint.coordinates.y],
          z: [steeredPoint.coordinates.z],
          text: [steeredPoint.label],
          hovertext: [hover],
          hovertemplate: '%{hovertext}<extra></extra>',
          textposition: 'bottom center',
          textfont: { size: 11, color: '#0F766E', family: 'Inter, sans-serif' },
          marker: {
            size: 10,
            color: '#0F766E',
            symbol: 'diamond',
            line: { width: 2, color: '#FFFFFF' },
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
          textposition: steerTextPos,
          textfont: { size: 11, color: '#0F766E', family: 'Inter, sans-serif' },
          marker: {
            size: 14,
            color: '#0F766E',
            symbol: 'diamond',
            line: { width: 2.5, color: '#FFFFFF' },
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
    hasActiveOverlay,
  ]);

  const focusedBounds = useMemo(() => {
    if (!focusActiveVector || !hasActiveOverlay) return null;
    const xs: number[] = [];
    const ys: number[] = [];
    const zs: number[] = [];

    if (originalPoint) {
      xs.push(originalPoint.coordinates.x);
      ys.push(originalPoint.coordinates.y);
      zs.push(originalPoint.coordinates.z);
    }
    if (steeredPoint) {
      xs.push(steeredPoint.coordinates.x);
      ys.push(steeredPoint.coordinates.y);
      zs.push(steeredPoint.coordinates.z);
    }
    for (const n of originalNeighbors ?? []) {
      xs.push(n.coordinates.x);
      ys.push(n.coordinates.y);
      zs.push(n.coordinates.z);
    }
    for (const n of steeredNeighbors ?? []) {
      xs.push(n.coordinates.x);
      ys.push(n.coordinates.y);
      zs.push(n.coordinates.z);
    }
    for (const s of trajectorySteps ?? []) {
      xs.push(s.coordinates.x);
      ys.push(s.coordinates.y);
      zs.push(s.coordinates.z);
    }

    if (xs.length === 0) return null;
    return {
      x: computeAxisBounds(xs),
      y: computeAxisBounds(ys),
      z: computeAxisBounds(zs),
    };
  }, [
    focusActiveVector,
    hasActiveOverlay,
    originalPoint,
    steeredPoint,
    originalNeighbors,
    steeredNeighbors,
    trajectorySteps,
  ]);

  const layout = useMemo<Partial<Layout>>(() => {
    const base: Partial<Layout> = {
      uirevision: `${mode}:${focusActiveVector ? 'focus' : 'full'}:${viewResetCount}:${activeVectorKey}`,
      datarevision: dataSignature,
      title: title
        ? {
            text: title,
            font: { size: 13, color: '#132033' },
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
        bgcolor: '#FAF9F6',
        camera: {
          eye: { x: 1.45, y: 1.45, z: 1.15 },
        },
        xaxis: {
          title: { text: 'UMAP X' },
          gridcolor: '#E2DFD7',
          zerolinecolor: '#CBD5E1',
          color: '#475569',
          ...(focusedBounds ? { range: focusedBounds.x, autorange: false } : {}),
        },
        yaxis: {
          title: { text: 'UMAP Y' },
          gridcolor: '#E2DFD7',
          zerolinecolor: '#CBD5E1',
          color: '#475569',
          ...(focusedBounds ? { range: focusedBounds.y, autorange: false } : {}),
        },
        zaxis: {
          title: { text: 'UMAP Z' },
          gridcolor: '#E2DFD7',
          zerolinecolor: '#CBD5E1',
          color: '#475569',
          ...(focusedBounds ? { range: focusedBounds.z, autorange: false } : {}),
        },
      };
    } else {
      base.xaxis = {
        title: { text: 'UMAP Dimension 1 (X)' },
        gridcolor: '#ECEAE3',
        zerolinecolor: '#CBD5E1',
        color: '#475569',
        ...(focusedBounds ? { range: focusedBounds.x, autorange: false } : {}),
      };
      base.yaxis = {
        title: { text: 'UMAP Dimension 2 (Y)' },
        gridcolor: '#ECEAE3',
        zerolinecolor: '#CBD5E1',
        color: '#475569',
        ...(focusedBounds ? { range: focusedBounds.y, autorange: false } : {}),
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
            arrowwidth: 2.2,
            arrowcolor: '#B45309',
          },
        ];
      }
    }

    return base;
  }, [
    is3D,
    mode,
    focusActiveVector,
    viewResetCount,
    activeVectorKey,
    dataSignature,
    title,
    originalPoint,
    steeredPoint,
    focusedBounds,
  ]);

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

  const handleResetView = () => {
    setFocusActiveVector(false);
    setViewResetCount((c) => c + 1);
    onResetView?.();
  };

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border-subtle bg-background/80 px-3 py-2 text-[11px] font-mono">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-text-secondary">
          {originalPoint && (
            <span>
              <span className="font-semibold text-brand-navy">Orig:</span>{' '}
              {is3D
                ? `(${formatNumber(originalPoint.coordinates.x, 2)}, ${formatNumber(originalPoint.coordinates.y, 2)}, ${formatNumber(originalPoint.coordinates.z, 2)})`
                : `(${formatNumber(originalPoint.coordinates.x, 2)}, ${formatNumber(originalPoint.coordinates.y, 2)})`}
            </span>
          )}
          {steeredPoint && (
            <span>
              <span className="font-semibold text-brand-teal">Steered:</span>{' '}
              {is3D
                ? `(${formatNumber(steeredPoint.coordinates.x, 2)}, ${formatNumber(steeredPoint.coordinates.y, 2)}, ${formatNumber(steeredPoint.coordinates.z, 2)})`
                : `(${formatNumber(steeredPoint.coordinates.x, 2)}, ${formatNumber(steeredPoint.coordinates.y, 2)})`}
            </span>
          )}
          {!originalPoint && !steeredPoint && trajectorySteps?.length ? (
            <span>
              <span className="font-semibold text-brand-navy">Trajectory:</span>{' '}
              {trajectorySteps.length} steps projected
            </span>
          ) : null}
          {!hasActiveOverlay && (
            <span className="text-text-muted">
              {(visiblePoints ?? semanticMap?.points ?? []).length} projected corpus points ({mode.toUpperCase()} view)
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {hasActiveOverlay && (
            <button
              type="button"
              onClick={() => setFocusActiveVector((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                focusActiveVector
                  ? 'border-brand-navy bg-brand-navy text-white'
                  : 'border-border bg-background-surface text-text-secondary hover:border-brand-slate/60 hover:text-brand-navy'
              }`}
            >
              {focusActiveVector ? (
                <>
                  <Globe className="w-3 h-3" />
                  <span>Full Corpus View</span>
                </>
              ) : (
                <>
                  <Focus className="w-3 h-3" />
                  <span>Zoom to Active Vector</span>
                </>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={handleResetView}
            title="Reset zoom, pan, and camera orientation"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background-surface px-2.5 py-1 text-[11px] font-medium text-text-secondary hover:border-brand-slate/60 hover:text-brand-navy transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset View</span>
          </button>
        </div>
      </div>

      <PlotlyChart
        plotKey={`${mode}:${viewResetCount}`}
        data={traces}
        layout={layout}
        onClick={onSelectCorpusPoint ? handleClick : undefined}
        heightClassName={heightClassName}
      />
      <div className="border-t border-border-subtle bg-background/70 px-4 py-2.5 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between text-[11px] text-text-muted">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1.5 text-brand-navy font-medium">
            <span className="w-2 h-2 rounded-full bg-[#1B2E4B] inline-block" />
            Original (λ=0.0)
          </span>
          <span className="inline-flex items-center gap-1.5 text-brand-teal font-medium">
            <span className="w-2 h-2 rotate-45 bg-[#0F766E] inline-block" />
            Steered (λ≠0.0)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full border border-[#1B2E4B] inline-block" />
            Top-K 384D Neighbors
          </span>
        </div>
        <p className="leading-relaxed sm:text-right">
          Colors mark corpus reference categories (not statistically validated clusters). UMAP
          distances approximate 384D geometry; cosine math executes in 384D.
        </p>
      </div>
    </div>
  );
};
