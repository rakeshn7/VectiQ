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
    className="inline-flex items-center rounded-lg border border-border bg-background/80 p-0.5"
  >
    <button
      type="button"
      onClick={() => onChange('2d')}
      className={cn(
        'px-2.5 py-1 rounded-md text-[11px] font-mono transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan/50',
        mode === '2d'
          ? 'bg-accent-cyan/20 text-accent-cyan font-semibold'
          : 'text-text-muted hover:text-text-primary'
      )}
    >
      2D (X, Y)
    </button>
    <button
      type="button"
      onClick={() => onChange('3d')}
      className={cn(
        'px-2.5 py-1 rounded-md text-[11px] font-mono transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-violet/50',
        mode === '3d'
          ? 'bg-accent-violet/20 text-purple-300 font-semibold'
          : 'text-text-muted hover:text-text-primary'
      )}
    >
      3D (X, Y, Z)
    </button>
  </div>
);
