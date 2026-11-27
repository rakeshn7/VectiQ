import React from 'react';
import Plot, { type PlotParams } from 'react-plotly.js';
import type { Config, Data, Layout } from 'plotly.js';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { cn } from '@/utils/cn';

// Safe CJS/ESM interop for react-plotly.js under Vite bundler
const SafePlot = ((Plot as unknown as { default?: typeof Plot }).default ?? Plot) as typeof Plot;

export const DARK_PLOTLY_LAYOUT: Partial<Layout> = {
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: '#090d16',
  font: {
    family: 'Inter, system-ui, sans-serif',
    color: '#94a3b8',
    size: 12,
  },
  margin: { l: 48, r: 24, t: 36, b: 48 },
  hoverlabel: {
    bgcolor: '#131c31',
    bordercolor: '#38bdf8',
    font: {
      family: 'Inter, system-ui, sans-serif',
      color: '#f8fafc',
      size: 12,
    },
  },
  legend: {
    bgcolor: 'rgba(15, 23, 42, 0.75)',
    bordercolor: '#1e293b',
    borderwidth: 1,
    font: { color: '#cbd5e1', size: 11 },
  },
};

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
  className?: string;
  heightClassName?: string;
}

export const PlotlyChart: React.FC<PlotlyChartProps> = ({
  data,
  layout,
  config,
  onClick,
  className,
  heightClassName = 'h-[420px]',
}) => {
  const mergedLayout: Partial<Layout> = {
    ...DARK_PLOTLY_LAYOUT,
    ...layout,
    autosize: true,
  };

  const mergedConfig: Partial<Config> = {
    ...DEFAULT_PLOTLY_CONFIG,
    ...config,
  };

  return (
    <ErrorBoundary fallbackTitle="Visualization Rendering Error">
      <div className={cn('w-full relative', heightClassName, className)}>
        <SafePlot
          data={data}
          layout={mergedLayout}
          config={mergedConfig}
          onClick={onClick}
          useResizeHandler
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </ErrorBoundary>
  );
};
