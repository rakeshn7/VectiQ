import React from 'react';
import { cn } from '@/utils/cn';

export type BadgeVariant = 'neutral' | 'cyan' | 'violet' | 'emerald' | 'amber' | 'rose' | 'blue';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantStyles: Record<BadgeVariant, string> = {
  neutral: 'bg-background-secondary text-text-secondary border-border',
  cyan: 'bg-slate-100 text-brand-navy border-slate-300/80',
  blue: 'bg-sky-50 text-brand-slate border-sky-200',
  violet: 'bg-teal-50 text-brand-teal border-teal-200',
  emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  amber: 'bg-amber-50 text-amber-800 border-amber-200',
  rose: 'bg-rose-50 text-rose-800 border-rose-200',
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
