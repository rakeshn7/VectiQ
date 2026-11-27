import React from 'react';
import Plot, { type PlotParams } from 'react-plotly.js';
import type { Config, Data, Layout } from 'plotly.js';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { cn } from '@/utils/cn';

// Safe CJS/ESM interop for react-plotly.js under Vite bundler
const SafePlot = ((Plot as unknown as { default?: typeof Plot }).default ?? Plot) as typeof Plot;

export function createLightPlotlyLayout(): Partial<Layout> {
  return {
    paper_bgcolor: 'rgba(255, 255, 255, 0)',
    plot_bgcolor: '#FAF9F6',
    font: {
      family: 'Inter, system-ui, sans-serif',
      color: '#475569',
      size: 12,
    },
    margin: { l: 52, r: 24, t: 36, b: 48 },
    hoverlabel: {
      bgcolor: '#FFFFFF',
      bordercolor: '#1B2E4B',
      font: {
        family: 'Inter, system-ui, sans-serif',
        color: '#132033',
        size: 12,
      },
    },
    legend: {
      bgcolor: 'rgba(255, 255, 255, 0.92)',
      bordercolor: '#E2DFD7',
      borderwidth: 1,
      font: { color: '#132033', size: 11 },
    },
  };
}

export const LIGHT_PLOTLY_LAYOUT: Partial<Layout> = createLightPlotlyLayout();

export const DEFAULT_PLOTLY_CONFIG: Partial<Config> = {
  responsive: true,
  displaylogo: false,
  modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d'],
};

export interface PlotlyChartProps {
  data: Data[];
  layout?: Partial<Layout>;
  config?: Partial<Config>;
  onClick?: PlotParams['onClick'];
  plotKey?: string;
  revision?: number;
  className?: string;
  heightClassName?: string;
}

export const PlotlyChart: React.FC<PlotlyChartProps> = ({
  data,
  layout,
  config,
  onClick,
  plotKey,
  revision,
  className,
  heightClassName = 'h-[420px]',
}) => {
  const baseLayout = createLightPlotlyLayout();
  const mergedLayout: Partial<Layout> = {
    ...baseLayout,
    ...layout,
    autosize: true,
  };

  const mergedConfig: Partial<Config> = {
    ...DEFAULT_PLOTLY_CONFIG,
    ...config,
    modeBarButtonsToRemove: [...(DEFAULT_PLOTLY_CONFIG.modeBarButtonsToRemove ?? [])],
  };

  return (
    <ErrorBoundary fallbackTitle="Visualization Rendering Error">
      <div className={cn('w-full relative rounded-xl overflow-hidden', heightClassName, className)}>
        <SafePlot
          key={plotKey}
          data={data}
          layout={mergedLayout}
          config={mergedConfig}
          revision={revision}
          onClick={onClick}
          useResizeHandler
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </ErrorBoundary>
  );
};
