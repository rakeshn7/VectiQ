import React from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className,
}) => (
  <div
    className={cn(
      'flex flex-col items-center justify-center text-center py-12 px-6 rounded-xl border border-dashed border-border bg-background-secondary/40',
      className
    )}
  >
    <div className="w-11 h-11 rounded-xl bg-background-elevated border border-border flex items-center justify-center text-text-muted mb-4">
      {icon ?? <Inbox className="w-5 h-5" />}
    </div>
    <h4 className="text-sm font-semibold text-text-primary">{title}</h4>
    <p className="mt-1.5 text-xs text-text-secondary max-w-md leading-relaxed">{description}</p>
    {action && <div className="mt-5">{action}</div>}
  </div>
);
