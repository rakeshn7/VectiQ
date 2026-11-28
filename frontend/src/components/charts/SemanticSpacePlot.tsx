import React, { useMemo, useState } from 'react';
import { Compass, Focus, Globe, Network, Orbit, RotateCcw, Eye, EyeOff } from 'lucide-react';
import type { Data, Layout, PlotMouseEvent } from 'plotly.js';
import { PlotlyChart } from '@/components/charts/PlotlyChart';
import { EmptyState } from '@/components/ui';
import type {
  Coordinate3D,
  EmotionCategory,
  EvaluationStep,
  HumanEmotionDistributionItem,
  HumanSentimentLabel,
  NearestNeighborItem,
  ReviewStatus,
  SemanticMapPoint,
  SemanticMapResponse,
} from '@/types/api';
import {
  EMOTION_COLOR_MAP,
  formatEmotionDisplay,
  formatEmotionDistributionSummary,
  formatSentimentDisplay,
  hasMultipleEmotions,
} from '@/utils/emotionDistribution';
import { formatNumber, formatSigned } from '@/utils/format';

export { EMOTION_COLOR_MAP };

export type SpaceViewMode = '2d' | '3d';
export type RelationshipLayoutMode = 'umap' | 'radial';

export interface HighlightPoint {
  label: string;
  text: string;
  coordinates: Coordinate3D;
  conceptScore?: number;
  emotion?: EmotionCategory | null;
  humanEmotion?: EmotionCategory | null;
  humanDistribution?: HumanEmotionDistributionItem[];
  humanSentiment?: HumanSentimentLabel | null;
  reviewStatus?: ReviewStatus | null;
  sentiment?: string | null;
}

export type GraphEmotionView = 'model' | 'human';

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
  colorBy?: 'category' | 'emotion';
  onColorByChange?: (next: 'category' | 'emotion') => void;
  emotionView?: GraphEmotionView;
  onEmotionViewChange?: (view: GraphEmotionView) => void;
  title?: string;
  heightClassName?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  onResetView?: () => void;
}

function resolveDominantHumanEmotion(params: {
  humanEmotion?: EmotionCategory | null;
  humanDistribution?: ReadonlyArray<{ emotion: string; percentage: number }> | null;
  fallback?: EmotionCategory | null;
}): EmotionCategory {
  const valid = [...(params.humanDistribution ?? [])]
    .filter((d) => d.percentage > 0 && d.emotion !== 'uncertain')
    .sort((a, b) => b.percentage - a.percentage);
  if (valid.length > 0) return valid[0].emotion as EmotionCategory;
  if (params.humanEmotion && params.humanEmotion !== 'uncertain') return params.humanEmotion;
  return params.fallback ?? 'neutral';
}

function formatAffectTooltipLines(params: {
  modelEmotion?: EmotionCategory | null;
  modelConfidence?: number | null;
  modelSentiment?: string | null;
  modelSentimentUncertain?: boolean | null;
  humanEmotion?: EmotionCategory | null;
  humanDistribution?: ReadonlyArray<{ emotion: string; percentage: number }> | null;
  humanSentiment?: string | null;
  reviewStatus?: ReviewStatus | null;
}): string {
  const modelLine = params.modelEmotion
    ? `<br>Model Prediction (Immutable): <b>${formatEmotionDisplay(params.modelEmotion)}</b>` +
      (params.modelConfidence != null ? ` (${(params.modelConfidence * 100).toFixed(1)}%)` : '')
    : '';

  const modelSentLine = params.modelSentiment
    ? `<br>Model Sentiment (Immutable): <b>${
        params.modelSentimentUncertain
          ? `Uncertain (${formatSentimentDisplay(params.modelSentiment)})`
          : formatSentimentDisplay(params.modelSentiment)
      }</b>`
    : '';

  let humanLine = '';
  if (params.reviewStatus === 'flagged_uncertain') {
    humanLine =
      '<br>Human Verification: <b style="color:#B45309">Flagged Uncertain</b> (excluded from confirmed emotions)';
  } else if (!params.reviewStatus || params.reviewStatus === 'unreviewed') {
    humanLine = '<br>Human Verification: <span style="color:#64748B">Unreviewed (AI baseline only)</span>';
  } else if (params.humanDistribution && params.humanDistribution.length > 0) {
    const distText = formatEmotionDistributionSummary(params.humanDistribution);
    const mixedTag = hasMultipleEmotions(params.humanDistribution) ? ' · Mixed Emotion' : '';
    humanLine = `<br>Human-Confirmed Emotion${mixedTag}: <b style="color:#0F766E">${distText}</b> ✓`;
  } else if (params.humanEmotion && params.humanEmotion !== 'uncertain') {
    humanLine = `<br>Human-Confirmed Emotion: <b style="color:#0F766E">${formatEmotionDisplay(params.humanEmotion)} 100%</b> ✓`;
  }

  const humanSentLine =
    params.reviewStatus === 'flagged_uncertain'
      ? '<br>Human-Confirmed Sentiment: <b style="color:#B45309">Uncertain</b>'
      : params.humanSentiment
      ? `<br>Human-Confirmed Sentiment: <b style="color:#0F766E">${formatSentimentDisplay(params.humanSentiment)}</b>`
      : '';

  return `${modelLine}${modelSentLine}${humanLine}${humanSentLine}`;
}

function resolvePointColorForView(params: {
  view: GraphEmotionView;
  modelEmotion?: EmotionCategory | null;
  humanEmotion?: EmotionCategory | null;
  humanDistribution?: ReadonlyArray<{ emotion: string; percentage: number }> | null;
  reviewStatus?: ReviewStatus | null;
  fallbackColor: string;
}): string {
  if (params.view === 'model') {
    return params.modelEmotion
      ? EMOTION_COLOR_MAP[params.modelEmotion]?.color ?? params.fallbackColor
      : params.fallbackColor;
  }
  if (params.reviewStatus === 'flagged_uncertain') {
    return EMOTION_COLOR_MAP.uncertain.color;
  }
  if (!params.reviewStatus || params.reviewStatus === 'unreviewed') {
    return '#94A3B8';
  }
  // Confirmed / corrected points use canonical dominant emotion color matching legend
  const dominant = resolveDominantHumanEmotion({
    humanEmotion: params.humanEmotion,
    humanDistribution: params.humanDistribution,
    fallback: params.modelEmotion,
  });
  return EMOTION_COLOR_MAP[dominant]?.color ?? params.fallbackColor;
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

function buildBezierCurve2D(
  pairs: Array<{ from: Coordinate3D; to: Coordinate3D }>,
  curvature = 0.2
): { x: Array<number | null>; y: Array<number | null> } {
  const x: Array<number | null> = [];
  const y: Array<number | null> = [];
  const steps = 10;

  pairs.forEach(({ from, to }, idx) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return;
    const sign = idx % 2 === 0 ? 1 : -1;
    const nx = (-dy / len) * sign;
    const ny = (dx / len) * sign;
    const cx = (from.x + to.x) * 0.5 + curvature * len * nx;
    const cy = (from.y + to.y) * 0.5 + curvature * len * ny;

    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const omt = 1 - t;
      x.push(omt * omt * from.x + 2 * omt * t * cx + t * t * to.x);
      y.push(omt * omt * from.y + 2 * omt * t * cy + t * t * to.y);
    }
    x.push(null);
    y.push(null);
  });

  return { x, y };
}

function buildBezierCurve3D(
  pairs: Array<{ from: Coordinate3D; to: Coordinate3D }>,
  curvature = 0.2
): { x: Array<number | null>; y: Array<number | null>; z: Array<number | null> } {
  const x: Array<number | null> = [];
  const y: Array<number | null> = [];
  const z: Array<number | null> = [];
  const steps = 10;

  pairs.forEach(({ from, to }, idx) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return;
    const sign = idx % 2 === 0 ? 1 : -1;
    const ax = Math.abs(dx / len) < 0.9 ? 1 : 0;
    const ay = Math.abs(dx / len) < 0.9 ? 0 : 1;
    let nx = dy * 0 - dz * ay;
    let ny = dz * ax - dx * 0;
    let nz = dx * ay - dy * ax;
    const nLen = Math.hypot(nx, ny, nz) || 1;
    nx = (nx / nLen) * sign;
    ny = (ny / nLen) * sign;
    nz = (nz / nLen) * sign;

    const cx = (from.x + to.x) * 0.5 + curvature * len * nx;
    const cy = (from.y + to.y) * 0.5 + curvature * len * ny;
    const cz = (from.z + to.z) * 0.5 + curvature * len * nz;

    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const omt = 1 - t;
      x.push(omt * omt * from.x + 2 * omt * t * cx + t * t * to.x);
      y.push(omt * omt * from.y + 2 * omt * t * cy + t * t * to.y);
      z.push(omt * omt * from.z + 2 * omt * t * cz + t * t * to.z);
    }
    x.push(null);
    y.push(null);
    z.push(null);
  });

  return { x, y, z };
}

function buildRadialNeighborCoords(
  items: NearestNeighborItem[],
  center: Coordinate3D,
  angleOffset = -Math.PI / 2,
  angleSpan = 2 * Math.PI
): Coordinate3D[] {
  if (items.length === 0) return [];
  const sims = items.map((i) => i.cosine_similarity);
  const minSim = Math.min(...sims);
  const maxSim = Math.max(...sims);
  const simSpan = Math.max(maxSim - minSim, 0.05);

  return items.map((item, idx) => {
    const rankFrac = (maxSim - item.cosine_similarity) / simSpan;
    const radius = 0.42 + 0.58 * rankFrac;
    const stepAngle = items.length === 1 ? 0 : (angleSpan * idx) / items.length;
    const theta = angleOffset + stepAngle;
    return {
      x: center.x + radius * Math.cos(theta),
      y: center.y + radius * Math.sin(theta),
      z: center.z + 0.16 * Math.sin(2 * theta),
    };
  });
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
  colorBy = 'category',
  onColorByChange,
  emotionView: controlledEmotionView,
  onEmotionViewChange,
  title,
  heightClassName = 'h-[460px]',
  emptyTitle = 'No Semantic Points to Display',
  emptyDescription = 'No coordinates match the current view or filter criteria.',
  onResetView,
}) => {
  const is3D = mode === '3d';
  const [focusActiveVector, setFocusActiveVector] = useState<boolean>(false);
  const [viewResetCount, setViewResetCount] = useState<number>(0);
  const [showHighlightedLinks, setShowHighlightedLinks] = useState<boolean>(true);
  const [relationshipLayout, setRelationshipLayout] =
    useState<RelationshipLayoutMode>('umap');
  // Dual-view toggle: 'human' uses Human-Confirmed Results; 'model' uses AI Model Predictions
  const [internalEmotionView, setInternalEmotionView] = useState<GraphEmotionView>('human');
  const graphEmotionView: GraphEmotionView = controlledEmotionView ?? internalEmotionView;
  const setGraphEmotionView = (next: GraphEmotionView) => {
    setInternalEmotionView(next);
    if (colorBy !== 'emotion') {
      onColorByChange?.('emotion');
    }
    onEmotionViewChange?.(next);
  };

  const hasActiveNeighbors = Boolean(
    (originalNeighbors && originalNeighbors.length > 0) ||
      (steeredNeighbors && steeredNeighbors.length > 0)
  );
  const hasActiveOverlay = Boolean(
    originalPoint || steeredPoint || (trajectorySteps && trajectorySteps.length > 0)
  );
  const effectiveLayout: RelationshipLayoutMode =
    hasActiveNeighbors && relationshipLayout === 'radial' ? 'radial' : 'umap';

  // Geometry-only key keeps Plotly camera viewport (uirevision) stable across label/review edits
  const geometryVectorKey = useMemo(() => {
    const origGeo = originalPoint
      ? `${originalPoint.coordinates.x}:${originalPoint.coordinates.y}:${originalPoint.coordinates.z}:${originalPoint.text}`
      : 'none';
    const steerGeo = steeredPoint
      ? `${steeredPoint.coordinates.x}:${steeredPoint.coordinates.y}:${steeredPoint.coordinates.z}:${steeredPoint.label}`
      : 'none';
    const trajGeo = trajectorySteps?.length
      ? `${trajectorySteps.length}:${trajectorySteps[0].coordinates.x}:${trajectorySteps[trajectorySteps.length - 1].coordinates.x}`
      : '0';
    return `${origGeo}|${steerGeo}|${trajGeo}`;
  }, [originalPoint, steeredPoint, trajectorySteps]);

  // Build deterministic revision keys so Plotly always re-draws when coordinates, distributions, or sentiments change
  const activeVectorKey = useMemo(() => {
    const origDistKey = (originalPoint?.humanDistribution ?? [])
      .map((d) => `${d.emotion}=${d.percentage}`)
      .join(',');
    const origKey = originalPoint
      ? `${geometryVectorKey}:${originalPoint.emotion ?? ''}:${originalPoint.humanEmotion ?? ''}:${originalPoint.humanSentiment ?? ''}:${originalPoint.reviewStatus ?? ''}:${origDistKey}`
      : geometryVectorKey;
    return origKey;
  }, [geometryVectorKey, originalPoint]);

  const dataSignature = useMemo(() => {
    const pts = visiblePoints ?? semanticMap?.points ?? [];
    const humanSig = pts
      .filter(
        (p) =>
          p.emotion_review_status &&
          p.emotion_review_status !== 'unreviewed'
      )
      .map(
        (p) =>
          `${p.id}:${p.emotion_review_status}:${p.human_emotion_label ?? ''}:${p.human_sentiment_label ?? ''}:${(
            p.human_emotion_distribution ?? []
          )
            .map((d) => `${d.emotion}=${d.percentage}`)
            .join(',')}`
      )
      .join(';');
    const ptsKey = `${pts.length}:${pts[0]?.id ?? ''}:${pts[pts.length - 1]?.id ?? ''}:${humanSig}`;
    return `${mode}|${effectiveLayout}|${colorBy}|${graphEmotionView}|${showHighlightedLinks ? 'links' : 'nolinks'}|${focusActiveVector ? 'focus' : 'full'}|${ptsKey}|${selectedCorpusPointId ?? ''}|${activeVectorKey}`;
  }, [
    mode,
    effectiveLayout,
    colorBy,
    graphEmotionView,
    showHighlightedLinks,
    focusActiveVector,
    visiblePoints,
    semanticMap,
    selectedCorpusPointId,
    activeVectorKey,
  ]);

  const traces = useMemo<Data[]>(() => {
    const result: Data[] = [];
    const points = visiblePoints ?? semanticMap?.points ?? [];
    const clusters = semanticMap?.clusters ?? [];

    const pointMetaById = new Map<string, SemanticMapPoint>();
    for (const pt of semanticMap?.points ?? points) {
      pointMetaById.set(pt.id, pt);
    }

    // Visual Radial Mode preserves original 384D embeddings & UMAP data while presenting actual neighbors circularly
    if (effectiveLayout === 'radial' && (originalPoint || steeredPoint || selectedCorpusPointId)) {
      const selectedCorpus = selectedCorpusPointId
        ? points.find((p) => p.id === selectedCorpusPointId) ?? null
        : null;
      const baseAnchor: HighlightPoint | null =
        originalPoint ??
        (selectedCorpus
          ? {
              label: `Selected (${selectedCorpus.id})`,
              text: selectedCorpus.text,
              coordinates: selectedCorpus.coordinates,
              emotion: selectedCorpus.emotion_label ?? null,
              humanEmotion: selectedCorpus.human_emotion_label ?? null,
              humanDistribution: (selectedCorpus.human_emotion_distribution ?? []).map((d) => ({
                emotion: d.emotion as EmotionCategory,
                percentage: d.percentage,
              })),
              humanSentiment: selectedCorpus.human_sentiment_label ?? null,
              sentiment: selectedCorpus.sentiment_label ?? null,
              reviewStatus: selectedCorpus.emotion_review_status ?? null,
            }
          : null);

      // 1. Subdued background corpus points normalized around outer ring context
      if (points.length > 0) {
        const xs = points.map((p) => p.coordinates.x);
        const ys = points.map((p) => p.coordinates.y);
        const zs = points.map((p) => p.coordinates.z);
        const midX = (Math.min(...xs) + Math.max(...xs)) * 0.5;
        const midY = (Math.min(...ys) + Math.max(...ys)) * 0.5;
        const midZ = (Math.min(...zs) + Math.max(...zs)) * 0.5;
        const scale = Math.max(
          Math.max(...xs) - Math.min(...xs),
          Math.max(...ys) - Math.min(...ys),
          1
        );
        const normPts = points.map((p) => ({
          x: ((p.coordinates.x - midX) / scale) * 2.5,
          y: ((p.coordinates.y - midY) / scale) * 2.5,
          z: ((p.coordinates.z - midZ) / scale) * 2.2,
        }));

        if (is3D) {
          result.push({
            type: 'scatter3d',
            mode: 'markers',
            name: 'Subdued Corpus Context',
            x: normPts.map((c) => c.x),
            y: normPts.map((c) => c.y),
            z: normPts.map((c) => c.z),
            hoverinfo: 'skip',
            marker: { size: 3, color: '#94A3B8', opacity: 0.14 },
          });
        } else {
          result.push({
            type: points.length > 500 ? 'scattergl' : 'scatter',
            mode: 'markers',
            name: 'Subdued Corpus Context',
            x: normPts.map((c) => c.x),
            y: normPts.map((c) => c.y),
            hoverinfo: 'skip',
            marker: { size: 5.5, color: '#94A3B8', opacity: 0.14 },
          });
        }
      }

      const bothActive = Boolean(baseAnchor && steeredPoint);
      const origCenter: Coordinate3D = bothActive ? { x: -0.45, y: 0, z: 0 } : { x: 0, y: 0, z: 0 };
      const steerCenter: Coordinate3D = { x: 0.45, y: 0, z: 0 };

      const origList = originalNeighbors ?? [];
      const steerList = steeredNeighbors ?? [];
      const origRadCoords = buildRadialNeighborCoords(
        origList,
        origCenter,
        bothActive ? (Math.PI * 0.55) : (-Math.PI / 2),
        bothActive ? Math.PI * 1.15 : Math.PI * 2
      );
      const steerRadCoords = buildRadialNeighborCoords(
        steerList,
        steerCenter,
        -Math.PI * 0.45,
        Math.PI * 1.15
      );

      // Curved Bezier relationship edges
      if (showHighlightedLinks && baseAnchor && origRadCoords.length > 0) {
        const pairs = origRadCoords.map((rc) => ({ from: origCenter, to: rc }));
        if (is3D) {
          const c3 = buildBezierCurve3D(pairs, 0.22);
          result.push({
            type: 'scatter3d',
            mode: 'lines',
            name: 'Highlighted Neighbor Links',
            x: c3.x,
            y: c3.y,
            z: c3.z,
            hoverinfo: 'skip',
            line: { width: 3.2, color: 'rgba(27, 46, 75, 0.65)' },
          });
        } else {
          const c2 = buildBezierCurve2D(pairs, 0.22);
          result.push({
            type: 'scatter',
            mode: 'lines',
            name: 'Highlighted Neighbor Links',
            x: c2.x,
            y: c2.y,
            hoverinfo: 'skip',
            line: { width: 2.0, color: 'rgba(27, 46, 75, 0.62)' },
          });
        }
      }

      if (showHighlightedLinks && steeredPoint && steerRadCoords.length > 0) {
        const pairs = steerRadCoords.map((rc) => ({ from: steerCenter, to: rc }));
        if (is3D) {
          const c3 = buildBezierCurve3D(pairs, 0.22);
          result.push({
            type: 'scatter3d',
            mode: 'lines',
            name: 'Steered Neighbor Links',
            x: c3.x,
            y: c3.y,
            z: c3.z,
            hoverinfo: 'skip',
            line: { width: 3.2, color: 'rgba(15, 118, 110, 0.68)' },
          });
        } else {
          const c2 = buildBezierCurve2D(pairs, 0.22);
          result.push({
            type: 'scatter',
            mode: 'lines',
            name: 'Steered Neighbor Links',
            x: c2.x,
            y: c2.y,
            hoverinfo: 'skip',
            line: { width: 2.0, color: 'rgba(15, 118, 110, 0.68)' },
          });
        }
      }

      if (baseAnchor && steeredPoint) {
        const bridge = buildBezierCurve2D([{ from: origCenter, to: steerCenter }], 0.18);
        if (is3D) {
          const bridge3 = buildBezierCurve3D([{ from: origCenter, to: steerCenter }], 0.18);
          result.push({
            type: 'scatter3d',
            mode: 'lines',
            name: 'Steering Shift',
            x: bridge3.x,
            y: bridge3.y,
            z: bridge3.z,
            hoverinfo: 'skip',
            line: { width: 4.5, color: '#B45309', dash: 'dash' },
          });
        } else {
          result.push({
            type: 'scatter',
            mode: 'lines',
            name: 'Steering Shift',
            x: bridge.x,
            y: bridge.y,
            hoverinfo: 'skip',
            line: { width: 2.4, color: '#B45309', dash: 'dash' },
          });
        }
      }

      if (origList.length > 0) {
        const hover = origList.map((n) => {
          const meta = pointMetaById.get(n.id);
          return (
            `<b>Neighbor (${n.category})</b><br>${truncateText(n.text)}` +
            `<br>384D Cosine Sim: ${formatNumber(n.cosine_similarity, 4)}` +
            formatAffectTooltipLines({
              modelEmotion: meta?.emotion_label,
              modelConfidence: meta?.emotion_confidence,
              humanEmotion: meta?.human_emotion_label,
              humanDistribution: meta?.human_emotion_distribution,
              reviewStatus: meta?.emotion_review_status,
            }) +
            `<br>Original UMAP: (${formatNumber(n.coordinates.x, 3)}, ${formatNumber(n.coordinates.y, 3)}, ${formatNumber(n.coordinates.z, 3)})`
          );
        });
        const colors = origList.map((n) => {
          const meta = pointMetaById.get(n.id);
          return resolvePointColorForView({
            view: graphEmotionView,
            modelEmotion: meta?.emotion_label,
            humanEmotion: meta?.human_emotion_label,
            humanDistribution: meta?.human_emotion_distribution,
            reviewStatus: meta?.emotion_review_status,
            fallbackColor: '#3E5C8A',
          });
        });
        if (is3D) {
          result.push({
            type: 'scatter3d',
            mode: 'text+markers',
            name: 'Nearest Neighbors (Radial Rank)',
            x: origRadCoords.map((c) => c.x),
            y: origRadCoords.map((c) => c.y),
            z: origRadCoords.map((c) => c.z),
            text: origList.map((n) => `#${origList.indexOf(n) + 1} (${n.cosine_similarity.toFixed(2)})`),
            hovertext: hover,
            customdata: origList.map((n) => n.id),
            hovertemplate: '%{hovertext}<extra></extra>',
            textfont: { size: 10, color: '#334155' },
            marker: { size: 7.5, color: colors, line: { width: 1.8, color: '#1B2E4B' } },
          });
        } else {
          result.push({
            type: 'scatter',
            mode: 'text+markers',
            name: 'Nearest Neighbors (Radial Rank)',
            x: origRadCoords.map((c) => c.x),
            y: origRadCoords.map((c) => c.y),
            text: origList.map((n) => `#${origList.indexOf(n) + 1} (${n.cosine_similarity.toFixed(2)})`),
            textposition: 'top center',
            hovertext: hover,
            customdata: origList.map((n) => n.id),
            hovertemplate: '%{hovertext}<extra></extra>',
            textfont: { size: 10, color: '#334155', family: 'JetBrains Mono, monospace' },
            marker: { size: 13, color: colors, line: { width: 2.2, color: '#1B2E4B' } },
          });
        }
      }

      if (steerList.length > 0) {
        const hover = steerList.map(
          (n) =>
            `<b>Steered Neighbor (${n.category})</b><br>${truncateText(n.text)}<br>Cosine Sim: ${formatNumber(n.cosine_similarity, 4)}`
        );
        if (is3D) {
          result.push({
            type: 'scatter3d',
            mode: 'markers',
            name: 'Steered Neighbors (Radial)',
            x: steerRadCoords.map((c) => c.x),
            y: steerRadCoords.map((c) => c.y),
            z: steerRadCoords.map((c) => c.z),
            text: hover,
            hovertemplate: '%{text}<extra></extra>',
            marker: { size: 7.5, color: '#0F766E', symbol: 'diamond' },
          });
        } else {
          result.push({
            type: 'scatter',
            mode: 'markers',
            name: 'Steered Neighbors (Radial)',
            x: steerRadCoords.map((c) => c.x),
            y: steerRadCoords.map((c) => c.y),
            text: hover,
            hovertemplate: '%{text}<extra></extra>',
            marker: { size: 12, color: 'rgba(15, 118, 110, 0.20)', symbol: 'diamond', line: { width: 2, color: '#0F766E' } },
          });
        }
      }

      if (baseAnchor) {
        const centerColor = resolvePointColorForView({
          view: graphEmotionView,
          modelEmotion: baseAnchor.emotion,
          humanEmotion: baseAnchor.humanEmotion,
          humanDistribution: baseAnchor.humanDistribution,
          reviewStatus: baseAnchor.reviewStatus,
          fallbackColor: '#1B2E4B',
        });
        const centerHover =
          `<b>${baseAnchor.label}</b><br>${truncateText(baseAnchor.text)}` +
          formatAffectTooltipLines({
            modelEmotion: baseAnchor.emotion,
            humanEmotion: baseAnchor.humanEmotion,
            humanDistribution: baseAnchor.humanDistribution,
            reviewStatus: baseAnchor.reviewStatus,
          }) +
          `<br>UMAP Coords: (${formatNumber(baseAnchor.coordinates.x, 3)}, ${formatNumber(baseAnchor.coordinates.y, 3)}, ${formatNumber(baseAnchor.coordinates.z, 3)})`;
        if (is3D) {
          result.push({
            type: 'scatter3d',
            mode: 'text+markers',
            name: baseAnchor.label,
            x: [origCenter.x],
            y: [origCenter.y],
            z: [origCenter.z],
            text: [baseAnchor.label],
            hovertext: [centerHover],
            hovertemplate: '%{hovertext}<extra></extra>',
            textposition: 'top center',
            textfont: { size: 11, color: '#132033' },
            marker: { size: 12, color: centerColor, symbol: 'circle', line: { width: 3, color: '#132033' } },
          });
        } else {
          result.push({
            type: 'scatter',
            mode: 'text+markers',
            name: baseAnchor.label,
            x: [origCenter.x],
            y: [origCenter.y],
            text: [baseAnchor.label],
            hovertext: [centerHover],
            hovertemplate: '%{hovertext}<extra></extra>',
            textposition: 'bottom center',
            textfont: { size: 11, color: '#132033' },
            marker: { size: 18, color: centerColor, symbol: 'circle', line: { width: 3, color: '#132033' } },
          });
        }
      }

      if (steeredPoint) {
        const steerHover = `<b>${steeredPoint.label}</b><br>${truncateText(steeredPoint.text)}`;
        if (is3D) {
          result.push({
            type: 'scatter3d',
            mode: 'text+markers',
            name: steeredPoint.label,
            x: [steerCenter.x],
            y: [steerCenter.y],
            z: [steerCenter.z],
            text: [steeredPoint.label],
            hovertext: [steerHover],
            hovertemplate: '%{hovertext}<extra></extra>',
            marker: { size: 11, color: '#0F766E', symbol: 'diamond', line: { width: 2, color: '#FFFFFF' } },
          });
        } else {
          result.push({
            type: 'scatter',
            mode: 'text+markers',
            name: steeredPoint.label,
            x: [steerCenter.x],
            y: [steerCenter.y],
            text: [steeredPoint.label],
            hovertext: [steerHover],
            hovertemplate: '%{hovertext}<extra></extra>',
            textposition: 'bottom center',
            marker: { size: 15, color: '#0F766E', symbol: 'diamond', line: { width: 2.5, color: '#FFFFFF' } },
          });
        }
      }

      return result;
    }

    // 1. Background corpus clusters (subdued when an active overlay or selected neighbors are shown)
    if (points.length > 0) {
      const grouped = new Map<string, SemanticMapPoint[]>();
      for (const pt of points) {
        let key: string;
        if (colorBy === 'emotion') {
          if (graphEmotionView === 'human') {
            if (pt.emotion_review_status === 'flagged_uncertain') {
              key = '__uncertain__';
            } else if (!pt.emotion_review_status || pt.emotion_review_status === 'unreviewed') {
              key = '__unreviewed__';
            } else {
              key = resolveDominantHumanEmotion({
                humanEmotion: pt.human_emotion_label,
                humanDistribution: pt.human_emotion_distribution,
                fallback: pt.emotion_label ?? 'neutral',
              });
            }
          } else {
            key = pt.emotion_label || 'neutral';
          }
        } else {
          key = pt.category || 'uncategorized';
        }
        const list = grouped.get(key) ?? [];
        list.push(pt);
        grouped.set(key, list);
      }

      const orderedKeys = Array.from(grouped.keys()).sort((a, b) => {
        if (a === '__unreviewed__') return 1;
        if (b === '__unreviewed__') return -1;
        if (a === '__uncertain__') return 1;
        if (b === '__uncertain__') return -1;
        return a.localeCompare(b);
      });

      orderedKeys.forEach((groupKey) => {
        const groupPoints = grouped.get(groupKey) ?? [];
        const isUnreviewedGroup = colorBy === 'emotion' && graphEmotionView === 'human' && groupKey === '__unreviewed__';
        const isUncertainGroup = colorBy === 'emotion' && graphEmotionView === 'human' && groupKey === '__uncertain__';
        const clusterMeta = clusters.find((c) => c.id === groupKey);
        const emoMeta =
          colorBy === 'emotion' && !isUnreviewedGroup && !isUncertainGroup
            ? EMOTION_COLOR_MAP[groupKey as EmotionCategory]
            : undefined;
        const color = isUnreviewedGroup
          ? 'rgba(148, 163, 184, 0.42)'
          : isUncertainGroup
          ? EMOTION_COLOR_MAP.uncertain.color
          : emoMeta?.color || clusterMeta?.color || '#64748b';
        const baseLabel = isUnreviewedGroup
          ? 'Unreviewed (AI Baseline)'
          : isUncertainGroup
          ? 'Flagged Uncertain (Excluded)'
          : emoMeta?.label || clusterMeta?.label || groupKey;
        const label = `${baseLabel} (${groupPoints.length})`;

        const hoverTexts = groupPoints.map((p) => {
          const affectLines = formatAffectTooltipLines({
            modelEmotion: p.emotion_label,
            modelConfidence: p.emotion_confidence,
            modelSentiment: p.sentiment_label,
            modelSentimentUncertain: p.sentiment_is_uncertain,
            humanEmotion: p.human_emotion_label,
            humanDistribution: p.human_emotion_distribution,
            humanSentiment: p.human_sentiment_label,
            reviewStatus: p.emotion_review_status,
          });
          return (
            `<b>${baseLabel}</b><br>` +
            `${truncateText(p.text)}<br>` +
            `Coords: (${formatNumber(p.coordinates?.x, 3)}, ${formatNumber(p.coordinates?.y, 3)}, ${formatNumber(p.coordinates?.z, 3)})` +
            affectLines +
            `<br>Concept Scores: S=${formatNumber(p.concept_scores?.positive_sentiment, 3)} | T=${formatNumber(p.concept_scores?.technical_tone, 3)} | F=${formatNumber(p.concept_scores?.formal_tone, 3)}`
          );
        });

        // In Human-Confirmed Results mode: confirmed/corrected points use canonical dominant emotion color,
        // mixed-emotion points render with diamond markers + dark ring outline, unreviewed is subdued, uncertain is marked distinctly.
        const useConfirmedHumanStyling =
          colorBy === 'emotion' &&
          graphEmotionView === 'human' &&
          !isUnreviewedGroup &&
          !isUncertainGroup;
        const hasMixedInGroup =
          useConfirmedHumanStyling &&
          groupPoints.some((p) => hasMultipleEmotions(p.human_emotion_distribution));

        const perPointLineColors2D = isUnreviewedGroup
          ? '#64748B'
          : isUncertainGroup
          ? '#78350F'
          : hasMixedInGroup
          ? groupPoints.map((p) =>
              hasMultipleEmotions(p.human_emotion_distribution) ? '#132033' : '#FFFFFF'
            )
          : '#FFFFFF';
        const perPointLineWidths2D = isUnreviewedGroup
          ? 1.2
          : isUncertainGroup
          ? 1.8
          : hasMixedInGroup
          ? groupPoints.map((p) => (hasMultipleEmotions(p.human_emotion_distribution) ? 2.4 : 1.2))
          : 1.2;
        const perPointSymbols2D = isUncertainGroup
          ? 'x'
          : hasMixedInGroup && points.length <= 500
          ? groupPoints.map((p) =>
              hasMultipleEmotions(p.human_emotion_distribution) ? 'diamond' : 'circle'
            )
          : 'circle';
        const perPointSymbols3D = isUncertainGroup
          ? 'cross'
          : hasMixedInGroup
          ? groupPoints.map((p) =>
              hasMultipleEmotions(p.human_emotion_distribution) ? 'diamond' : 'circle'
            )
          : 'circle';

        const hasFocus = hasActiveOverlay || Boolean(selectedCorpusPointId && hasActiveNeighbors);
        const baseOpacity2D = isUnreviewedGroup ? (hasFocus ? 0.2 : 0.65) : hasFocus ? 0.3 : 0.92;
        const baseOpacity3D = isUnreviewedGroup ? (hasFocus ? 0.18 : 0.52) : hasFocus ? 0.28 : 0.9;

        const perPointSizes3D = isUnreviewedGroup
          ? hasFocus
            ? 3
            : 4
          : hasMixedInGroup
          ? groupPoints.map((p) =>
              hasMultipleEmotions(p.human_emotion_distribution) ? (hasFocus ? 5.5 : 8) : hasFocus ? 4 : 6
            )
          : useConfirmedHumanStyling
          ? hasFocus
            ? 4
            : 6
          : hasFocus
          ? 3.5
          : 5;
        const perPointSizes2D = isUnreviewedGroup
          ? hasFocus
            ? 5
            : 6.5
          : hasMixedInGroup
          ? groupPoints.map((p) =>
              hasMultipleEmotions(p.human_emotion_distribution) ? (hasFocus ? 9.5 : 12) : hasFocus ? 7 : 9
            )
          : useConfirmedHumanStyling
          ? hasFocus
            ? 7
            : 9
          : hasFocus
          ? 6
          : 8;

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
              size: perPointSizes3D,
              color,
              symbol: perPointSymbols3D as unknown as string,
              opacity: baseOpacity3D,
              line: { width: isUnreviewedGroup ? 0.5 : 1.0, color: isUnreviewedGroup ? '#64748B' : '#FFFFFF' },
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
              size: perPointSizes2D,
              color,
              symbol: perPointSymbols2D as unknown as string,
              opacity: baseOpacity2D,
              line: { width: perPointLineWidths2D, color: perPointLineColors2D },
            },
          });
        }
      });
    }

    // 1.5 Smooth Curved Highlighted Connections in Original UMAP Geometry
    if (showHighlightedLinks) {
      const selectedCorpus = selectedCorpusPointId
        ? points.find((p) => p.id === selectedCorpusPointId) ?? null
        : null;
      const anchorCoord = originalPoint?.coordinates ?? selectedCorpus?.coordinates ?? null;
      if (anchorCoord && originalNeighbors && originalNeighbors.length > 0) {
        const origPairs = originalNeighbors.map((n) => ({
          from: anchorCoord,
          to: n.coordinates,
        }));
        if (is3D) {
          const c3 = buildBezierCurve3D(origPairs, 0.2);
          result.push({
            type: 'scatter3d',
            mode: 'lines',
            name: 'Highlighted Neighbor Links',
            x: c3.x,
            y: c3.y,
            z: c3.z,
            hoverinfo: 'skip',
            line: { width: 3.0, color: 'rgba(27, 46, 75, 0.62)' },
          });
        } else {
          const c2 = buildBezierCurve2D(origPairs, 0.2);
          result.push({
            type: 'scatter',
            mode: 'lines',
            name: 'Highlighted Neighbor Links',
            x: c2.x,
            y: c2.y,
            hoverinfo: 'skip',
            line: { width: 1.9, color: 'rgba(27, 46, 75, 0.58)' },
          });
        }
      }
      if (steeredPoint && steeredNeighbors && steeredNeighbors.length > 0) {
        const steerPairs = steeredNeighbors.map((n) => ({
          from: steeredPoint.coordinates,
          to: n.coordinates,
        }));
        if (is3D) {
          const c3 = buildBezierCurve3D(steerPairs, 0.2);
          result.push({
            type: 'scatter3d',
            mode: 'lines',
            name: 'Steered Neighbor Links',
            x: c3.x,
            y: c3.y,
            z: c3.z,
            hoverinfo: 'skip',
            line: { width: 3.0, color: 'rgba(15, 118, 110, 0.62)' },
          });
        } else {
          const c2 = buildBezierCurve2D(steerPairs, 0.2);
          result.push({
            type: 'scatter',
            mode: 'lines',
            name: 'Steered Neighbor Links',
            x: c2.x,
            y: c2.y,
            hoverinfo: 'skip',
            line: { width: 1.9, color: 'rgba(15, 118, 110, 0.60)' },
          });
        }
      }
    }

    // 2. Selected corpus point highlight (honors AI Model Predictions vs Human-Confirmed Results tooltip & colors)
    if (selectedCorpusPointId && points.length > 0) {
      const selected = points.find((p) => p.id === selectedCorpusPointId);
      if (selected) {
        const selColor =
          colorBy === 'emotion'
            ? resolvePointColorForView({
                view: graphEmotionView,
                modelEmotion: selected.emotion_label,
                humanEmotion: selected.human_emotion_label,
                humanDistribution: selected.human_emotion_distribution,
                reviewStatus: selected.emotion_review_status,
                fallbackColor: '#1B2E4B',
              })
            : '#1B2E4B';
        const selIsMixed =
          colorBy === 'emotion' &&
          graphEmotionView === 'human' &&
          selected.emotion_review_status !== 'flagged_uncertain' &&
          selected.emotion_review_status !== 'unreviewed' &&
          hasMultipleEmotions(selected.human_emotion_distribution);
        const selIsUncertain =
          colorBy === 'emotion' &&
          graphEmotionView === 'human' &&
          selected.emotion_review_status === 'flagged_uncertain';

        const hover =
          `<b>Selected Corpus Point (${selected.id})</b><br>` +
          `${truncateText(selected.text)}` +
          formatAffectTooltipLines({
            modelEmotion: selected.emotion_label,
            modelConfidence: selected.emotion_confidence,
            modelSentiment: selected.sentiment_label,
            modelSentimentUncertain: selected.sentiment_is_uncertain,
            humanEmotion: selected.human_emotion_label,
            humanDistribution: selected.human_emotion_distribution,
            humanSentiment: selected.human_sentiment_label,
            reviewStatus: selected.emotion_review_status,
          }) +
          `<br>Coords: (${formatNumber(selected.coordinates?.x, 3)}, ${formatNumber(selected.coordinates?.y, 3)}, ${formatNumber(selected.coordinates?.z, 3)})`;

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
              size: 11,
              color: selColor,
              symbol: selIsUncertain ? 'cross' : selIsMixed ? 'diamond' : 'circle',
              line: { width: 3, color: '#132033' },
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
              size: selIsMixed ? 18 : 16,
              color: 'rgba(19, 32, 51, 0.08)',
              symbol: selIsUncertain ? 'circle' : selIsMixed ? 'diamond' : 'circle',
              line: { width: 3, color: '#132033' },
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

    // 6. Original Point Marker (honors AI Model Predictions vs Human-Confirmed Results mode)
    if (originalPoint) {
      const modelEmoMeta = originalPoint.emotion
        ? EMOTION_COLOR_MAP[originalPoint.emotion]
        : undefined;
      const activeHumanDist =
        originalPoint.reviewStatus === 'flagged_uncertain' ||
        originalPoint.reviewStatus === 'unreviewed' ||
        !originalPoint.reviewStatus
          ? []
          : originalPoint.humanDistribution && originalPoint.humanDistribution.length > 0
          ? originalPoint.humanDistribution
          : originalPoint.humanEmotion && originalPoint.humanEmotion !== 'uncertain'
          ? [{ emotion: originalPoint.humanEmotion, percentage: 100 }]
          : [];
      const dominantHumanEmo = resolveDominantHumanEmotion({
        humanEmotion: originalPoint.humanEmotion,
        humanDistribution: activeHumanDist,
        fallback: originalPoint.emotion,
      });
      const isMixedHuman = hasMultipleEmotions(activeHumanDist);
      const humanSummary =
        originalPoint.reviewStatus === 'flagged_uncertain'
          ? 'Flagged Uncertain (excluded)'
          : formatEmotionDistributionSummary(activeHumanDist);

      const useHumanHighlight = graphEmotionView === 'human';
      const pointFill = resolvePointColorForView({
        view: graphEmotionView,
        modelEmotion: originalPoint.emotion,
        humanEmotion: originalPoint.humanEmotion,
        humanDistribution: activeHumanDist,
        reviewStatus: originalPoint.reviewStatus,
        fallbackColor: '#1B2E4B',
      });

      const displayEmoLabel = useHumanHighlight
        ? originalPoint.reviewStatus === 'flagged_uncertain'
          ? 'Uncertain'
          : !originalPoint.reviewStatus || originalPoint.reviewStatus === 'unreviewed'
          ? 'Unreviewed'
          : humanSummary || EMOTION_COLOR_MAP[dominantHumanEmo]?.label
        : modelEmoMeta?.label;

      const hover =
        `<b>${originalPoint.label}</b><br>` +
        `${truncateText(originalPoint.text)}` +
        formatAffectTooltipLines({
          modelEmotion: originalPoint.emotion,
          modelSentiment: originalPoint.sentiment,
          humanEmotion: originalPoint.humanEmotion,
          humanDistribution: activeHumanDist,
          humanSentiment: originalPoint.humanSentiment,
          reviewStatus: originalPoint.reviewStatus,
        }) +
        `<br>Coords: (${formatNumber(originalPoint.coordinates?.x, 3)}, ${formatNumber(originalPoint.coordinates?.y, 3)}, ${formatNumber(originalPoint.coordinates?.z, 3)})` +
        (originalPoint.conceptScore !== undefined
          ? `<br>Concept Score: ${formatNumber(originalPoint.conceptScore, 4)}`
          : '');

      const origSymbol2D =
        useHumanHighlight && originalPoint.reviewStatus === 'flagged_uncertain'
          ? 'x'
          : useHumanHighlight && isMixedHuman
          ? 'diamond'
          : 'circle';
      const origSymbol3D =
        useHumanHighlight && originalPoint.reviewStatus === 'flagged_uncertain'
          ? 'cross'
          : useHumanHighlight && isMixedHuman
          ? 'diamond'
          : 'circle';

      if (is3D) {
        result.push({
          type: 'scatter3d',
          mode: 'text+markers',
          name: displayEmoLabel ? `${originalPoint.label} (${displayEmoLabel})` : originalPoint.label,
          x: [originalPoint.coordinates.x],
          y: [originalPoint.coordinates.y],
          z: [originalPoint.coordinates.z],
          text: [originalPoint.label],
          hovertext: [hover],
          hovertemplate: '%{hovertext}<extra></extra>',
          textposition: 'top center',
          textfont: { size: 11, color: '#132033', family: 'Inter, sans-serif' },
          marker: {
            size: 11.5,
            color: pointFill,
            symbol: origSymbol3D,
            line: { width: 3, color: '#132033' },
          },
        });
      } else {
        result.push({
          type: 'scatter',
          mode: 'text+markers',
          name: displayEmoLabel ? `${originalPoint.label} (${displayEmoLabel})` : originalPoint.label,
          x: [originalPoint.coordinates.x],
          y: [originalPoint.coordinates.y],
          text: [originalPoint.label],
          hovertext: [hover],
          hovertemplate: '%{hovertext}<extra></extra>',
          textposition: origTextPos,
          textfont: { size: 11, color: '#132033', family: 'Inter, sans-serif' },
          marker: {
            size: 16,
            color: pointFill,
            symbol: origSymbol2D,
            line: { width: 3, color: '#132033' },
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
    colorBy,
    graphEmotionView,
    showHighlightedLinks,
    effectiveLayout,
    hasActiveNeighbors,
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
      uirevision: `${mode}:${effectiveLayout}:${focusActiveVector ? 'focus' : 'full'}:${viewResetCount}:${geometryVectorKey}`,
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

    if (effectiveLayout === 'radial') {
      if (is3D) {
        base.scene = {
          bgcolor: '#FAF9F6',
          camera: { eye: { x: 1.4, y: 1.4, z: 1.1 } },
          xaxis: { title: { text: 'Radial Sim X (Visual Presentation)' }, gridcolor: '#E2DFD7', zerolinecolor: '#CBD5E1', range: [-1.4, 1.4] },
          yaxis: { title: { text: 'Radial Sim Y (Visual Presentation)' }, gridcolor: '#E2DFD7', zerolinecolor: '#CBD5E1', range: [-1.4, 1.4] },
          zaxis: { title: { text: 'Radial Depth' }, gridcolor: '#E2DFD7', zerolinecolor: '#CBD5E1', range: [-1.2, 1.2] },
        };
      } else {
        base.xaxis = {
          title: { text: 'Radial Similarity Axis X (Not UMAP)' },
          gridcolor: '#ECEAE3',
          zerolinecolor: '#CBD5E1',
          range: [-1.45, 1.45],
        };
        base.yaxis = {
          title: { text: 'Radial Similarity Axis Y (Not UMAP)' },
          gridcolor: '#ECEAE3',
          zerolinecolor: '#CBD5E1',
          range: [-1.35, 1.35],
          scaleanchor: 'x',
        };
      }
      return base;
    }

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
    effectiveLayout,
    focusActiveVector,
    viewResetCount,
    geometryVectorKey,
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

        <div className="flex flex-wrap items-center gap-1.5">
          {hasActiveNeighbors && (
            <>
              <button
                type="button"
                onClick={() => setShowHighlightedLinks((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  showHighlightedLinks
                    ? 'border-brand-navy/50 bg-slate-100 text-brand-navy'
                    : 'border-border bg-background-surface text-text-secondary hover:border-brand-slate/60 hover:text-brand-navy'
                }`}
              >
                {showHighlightedLinks ? (
                  <>
                    <Eye className="w-3 h-3" />
                    <span>Hide Links</span>
                  </>
                ) : (
                  <>
                    <EyeOff className="w-3 h-3" />
                    <span>Show Links</span>
                  </>
                )}
              </button>

              <div className="inline-flex rounded-lg border border-border bg-background-surface p-0.5">
                <button
                  type="button"
                  onClick={() => setRelationshipLayout('umap')}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
                    effectiveLayout === 'umap'
                      ? 'bg-brand-navy text-white'
                      : 'text-text-secondary hover:text-brand-navy'
                  }`}
                >
                  <Orbit className="w-3 h-3" />
                  <span>UMAP View</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRelationshipLayout('radial')}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
                    effectiveLayout === 'radial'
                      ? 'bg-brand-teal text-white'
                      : 'text-text-secondary hover:text-brand-navy'
                  }`}
                >
                  <Network className="w-3 h-3" />
                  <span>Radial View</span>
                </button>
              </div>
            </>
          )}
          {hasActiveOverlay && effectiveLayout === 'umap' && (
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
          <div
            role="group"
            aria-label="Graph Visualization Mode"
            className="inline-flex rounded-lg border border-border bg-background-surface p-0.5"
            title="Switch between AI Model Predictions (immutable baseline) and Human-Confirmed Results"
          >
            <button
              type="button"
              aria-pressed={colorBy === 'emotion' && graphEmotionView === 'model'}
              onClick={() => setGraphEmotionView('model')}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                colorBy === 'emotion' && graphEmotionView === 'model'
                  ? 'bg-brand-navy text-white'
                  : 'text-text-secondary hover:text-brand-navy'
              }`}
            >
              <span>AI Model Predictions</span>
            </button>
            <button
              type="button"
              aria-pressed={colorBy === 'emotion' && graphEmotionView === 'human'}
              onClick={() => setGraphEmotionView('human')}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                colorBy === 'emotion' && graphEmotionView === 'human'
                  ? 'bg-brand-teal text-white'
                  : 'text-text-secondary hover:text-brand-navy'
              }`}
            >
              <span>Human-Confirmed Results</span>
            </button>
          </div>
        </div>
      </div>

      {effectiveLayout === 'radial' && (
        <div className="rounded-xl border border-teal-200 bg-teal-50/70 px-3 py-2 text-[11px] text-teal-950 flex flex-wrap items-center justify-between gap-2">
          <span>
            <strong>Radial Relationship Presentation (Not UMAP Geometry):</strong> Active sentence centered with genuine 384D neighbors arranged circularly by similarity rank (<span className="font-mono">r ∝ 1 − cos</span>).
          </span>
          <span className="font-mono text-teal-800">Underlying embeddings &amp; UMAP unchanged</span>
        </div>
      )}

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
            Steered / Mixed (Diamond)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full border border-[#1B2E4B] inline-block" />
            Top-K 384D Neighbors
          </span>
          {colorBy === 'emotion' && graphEmotionView === 'human' && (
            <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] text-brand-navy">
              {(() => {
                const activePts = visiblePoints ?? semanticMap?.points ?? [];
                const confirmedCnt = activePts.filter(
                  (p) =>
                    p.emotion_review_status === 'confirmed' ||
                    p.emotion_review_status === 'corrected'
                ).length;
                const mixedCnt = activePts.filter(
                  (p) =>
                    (p.emotion_review_status === 'confirmed' ||
                      p.emotion_review_status === 'corrected') &&
                    hasMultipleEmotions(p.human_emotion_distribution)
                ).length;
                const uncertainCnt = activePts.filter(
                  (p) => p.emotion_review_status === 'flagged_uncertain'
                ).length;
                const unreviewedCnt = activePts.length - confirmedCnt - uncertainCnt;
                return `${confirmedCnt} confirmed (${mixedCnt} mixed) · ${uncertainCnt} uncertain · ${unreviewedCnt} unreviewed`;
              })()}
            </span>
          )}
        </div>
        <p className="leading-relaxed sm:text-right">
          UMAP coordinates remain immutable across annotations; cosine math executes in 384D.
          {colorBy === 'emotion' && (
            <>
              {' '}
              <span className="font-medium">
                {graphEmotionView === 'human'
                  ? 'Human-Confirmed Results mode active: dominant human emotion sets color; diamonds mark mixed emotions; unreviewed and uncertain points are separated.'
                  : 'AI Model Predictions mode active: original immutable classifier emotion & sentiment labels only.'}
              </span>
            </>
          )}
        </p>
      </div>
    </div>
  );
};
