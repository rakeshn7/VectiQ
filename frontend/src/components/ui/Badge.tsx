import React from 'react';
import { cn } from '@/utils/cn';

export type BadgeVariant = 'neutral' | 'cyan' | 'violet' | 'emerald' | 'amber' | 'rose' | 'blue';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantStyles: Record<BadgeVariant, string> = {
  neutral: 'bg-background-elevated text-text-secondary border-border',
  cyan: 'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/25',
  blue: 'bg-sky-500/10 text-sky-300 border-sky-500/25',
  violet: 'bg-accent-violet/10 text-purple-300 border-accent-violet/25',
  emerald: 'bg-accent-emerald/10 text-emerald-300 border-accent-emerald/25',
  amber: 'bg-accent-amber/10 text-amber-300 border-accent-amber/25',
  rose: 'bg-rose-500/10 text-rose-300 border-rose-500/25',
};

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  className,
  children,
  ...props
}) => (
  <span
    className={cn(
      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-mono font-medium leading-5',
      variantStyles[variant],
      className
    )}
    {...props}
  >
    {children}
  </span>
);
