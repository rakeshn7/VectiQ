import React, { useId } from 'react';
import { cn } from '@/utils/cn';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  leftIcon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({
  label,
  helperText,
  error,
  leftIcon,
  id,
  className,
  ...props
}) => {
  const generatedId = useId();
  const inputId = id || generatedId;

  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-medium text-text-secondary">
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
            {leftIcon}
          </div>
        )}
        <input
          id={inputId}
          aria-invalid={Boolean(error)}
          className={cn(
            'w-full rounded-lg border bg-background/80 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted',
            'transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-accent-cyan/40',
            error ? 'border-rose-500/60 focus:border-rose-400' : 'border-border focus:border-accent-cyan/60',
            leftIcon && 'pl-9',
            className
          )}
          {...props}
        />
      </div>
      {error ? (
        <p className="text-xs text-rose-400">{error}</p>
      ) : (
        helperText && <p className="text-xs text-text-muted">{helperText}</p>
      )}
    </div>
  );
};

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helperText?: string;
  error?: string;
  showCount?: boolean;
}

export const Textarea: React.FC<TextareaProps> = ({
  label,
  helperText,
  error,
  showCount = false,
  maxLength,
  value,
  id,
  className,
  ...props
}) => {
  const generatedId = useId();
  const inputId = id || generatedId;
  const currentLength = typeof value === 'string' ? value.length : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-medium text-text-secondary">
            {label}
          </label>
        )}
        {showCount && (
          <span
            className={cn(
              'text-[11px] font-mono',
              maxLength && currentLength > maxLength ? 'text-rose-400' : 'text-text-muted'
            )}
          >
            {currentLength}
            {maxLength ? `/${maxLength}` : ''}
          </span>
        )}
      </div>
      <textarea
        id={inputId}
        maxLength={maxLength}
        value={value}
        aria-invalid={Boolean(error)}
        className={cn(
          'w-full rounded-lg border bg-background/80 px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted',
          'transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-accent-cyan/40 resize-y',
          error ? 'border-rose-500/60 focus:border-rose-400' : 'border-border focus:border-accent-cyan/60',
          className
        )}
        {...props}
      />
      {error ? (
        <p className="text-xs text-rose-400">{error}</p>
      ) : (
        helperText && <p className="text-xs text-text-muted">{helperText}</p>
      )}
    </div>
  );
};
