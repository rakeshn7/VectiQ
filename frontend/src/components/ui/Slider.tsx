import React, { useId } from 'react';
import { cn } from '@/utils/cn';
import { formatSigned } from '@/utils/format';

export interface SliderProps {
  label?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  negativeLabel?: string;
  positiveLabel?: string;
  presets?: number[];
  disabled?: boolean;
  className?: string;
}

export const Slider: React.FC<SliderProps> = ({
  label = 'Steering Strength (λ)',
  value,
  min = -1.0,
  max = 1.0,
  step = 0.05,
  onChange,
  negativeLabel,
  positiveLabel,
  presets = [-1.0, -0.5, 0.0, 0.5, 1.0],
  disabled = false,
  className,
}) => {
  const sliderId = useId();
  const normalized = Math.abs(value) < 0.005 ? 0 : value;

  const polarityColor =
    normalized > 0
      ? 'text-purple-300 border-accent-violet/35 bg-accent-violet/15'
      : normalized < 0
      ? 'text-accent-cyan border-accent-cyan/35 bg-accent-cyan/15'
      : 'text-text-secondary border-border bg-background-elevated';

  const formattedValue = formatSigned(normalized, 2);

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={sliderId} className="text-xs font-medium text-text-secondary">
          {label}
        </label>
        <span
          className={cn(
            'px-2.5 py-0.5 rounded-md border font-mono text-xs font-semibold tabular-nums',
            polarityColor
          )}
        >
          {formattedValue}
        </span>
      </div>

      <div className="relative pt-1 pb-2">
        <input
          id={sliderId}
          type="range"
          min={min}
          max={max}
          step={step}
          value={normalized}
          disabled={disabled}
          onChange={(e) => {
            const parsed = parseFloat(e.target.value);
            onChange(Math.abs(parsed) < 0.005 ? 0 : parsed);
          }}
          aria-valuetext={`${formattedValue} (${
            normalized === 0 ? 'Neutral baseline' : normalized > 0 ? 'Positive pole' : 'Negative pole'
          })`}
          className="studio-range disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <div className="flex justify-between gap-2 text-[10px] font-mono text-text-muted mt-2 px-0.5">
          <span className="truncate">{negativeLabel ? `${min.toFixed(1)} (${negativeLabel})` : min.toFixed(1)}</span>
          <span className="text-text-secondary shrink-0">0.0 (Neutral)</span>
          <span className="truncate text-right">
            {positiveLabel ? `+${max.toFixed(1)} (${positiveLabel})` : `+${max.toFixed(1)}`}
          </span>
        </div>
      </div>

      {presets.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {presets.map((preset) => {
            const active = Math.abs(normalized - preset) < 0.001;
            return (
              <button
                key={preset}
                type="button"
                disabled={disabled}
                onClick={() => onChange(preset)}
                className={cn(
                  'px-2 py-1 rounded-md text-[11px] font-mono border transition-colors',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan/50',
                  active
                    ? 'border-accent-cyan/50 bg-accent-cyan/15 text-accent-cyan'
                    : 'border-border bg-background/60 text-text-muted hover:text-text-primary hover:border-slate-600'
                )}
              >
                {preset > 0 ? `+${preset}` : preset === 0 ? '0.0' : preset}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
