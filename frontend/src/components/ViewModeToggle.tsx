import React from 'react';
import type { SpaceViewMode } from '@/components/charts';
import { cn } from '@/utils/cn';

export interface ViewModeToggleProps {
  mode: SpaceViewMode;
  onChange: (mode: SpaceViewMode) => void;
}

export const ViewModeToggle: React.FC<ViewModeToggleProps> = ({ mode, onChange }) => (
  <div
    role="group"
    aria-label="Projection Dimensionality"
    className="inline-flex items-center rounded-xl border border-border bg-background-secondary p-0.5"
  >
    <button
      type="button"
      onClick={() => onChange('2d')}
      className={cn(
        'px-3 py-1 rounded-lg text-[11px] font-mono transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-slate/40',
        mode === '2d'
          ? 'bg-background-surface text-brand-navy font-semibold shadow-editorial-sm'
          : 'text-text-muted hover:text-text-primary'
      )}
    >
      2D (X, Y)
    </button>
    <button
      type="button"
      onClick={() => onChange('3d')}
      className={cn(
        'px-3 py-1 rounded-lg text-[11px] font-mono transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal/40',
        mode === '3d'
          ? 'bg-background-surface text-brand-teal font-semibold shadow-editorial-sm'
          : 'text-text-muted hover:text-text-primary'
      )}
    >
      3D (X, Y, Z)
    </button>
  </div>
);
