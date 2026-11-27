import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';

export const Spinner: React.FC<{ className?: string; size?: 'sm' | 'md' | 'lg' }> = ({
  className,
  size = 'md',
}) => {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-7 h-7',
  };
  return <Loader2 className={cn('animate-spin text-accent-cyan', sizes[size], className)} />;
};

export interface LoadingStateProps {
  title?: string;
  description?: string;
  className?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  title = 'Processing request…',
  description = 'Waiting for FastAPI backend response.',
  className,
}) => (
  <div
    className={cn(
      'flex flex-col items-center justify-center text-center py-12 px-6 rounded-xl border border-border bg-background-surface/50',
      className
    )}
  >
    <Spinner size="lg" />
    <p className="mt-4 text-sm font-medium text-text-primary">{title}</p>
    {description && <p className="mt-1 text-xs text-text-muted max-w-sm">{description}</p>}
  </div>
);
