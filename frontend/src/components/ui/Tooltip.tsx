import React, { useId, useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface TooltipProps {
  content: string;
  children?: React.ReactNode;
  className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({ content, children, className }) => {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();

  return (
    <span
      className={cn('relative inline-flex items-center', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
      }}
    >
      <button
        type="button"
        aria-label={content}
        aria-describedby={open ? tooltipId : undefined}
        className="inline-flex items-center text-text-muted hover:text-accent-cyan focus:outline-none focus-visible:text-accent-cyan focus-visible:ring-2 focus-visible:ring-accent-cyan/50 rounded transition-colors"
      >
        {children ?? <HelpCircle className="w-3.5 h-3.5" />}
      </button>
      {open && (
        <span
          id={tooltipId}
          role="tooltip"
          className="absolute bottom-full right-0 sm:left-1/2 sm:-translate-x-1/2 mb-2 z-50 w-60 rounded-lg border border-border bg-background-elevated px-3 py-2 text-xs text-text-secondary shadow-xl pointer-events-none leading-relaxed text-left"
        >
          {content}
        </span>
      )}
    </span>
  );
};
