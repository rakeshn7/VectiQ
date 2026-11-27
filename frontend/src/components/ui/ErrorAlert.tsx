import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import type { ParsedApiError } from '@/services';
import { Button } from '@/components/ui/Button';
import { cn } from '@/utils/cn';

export interface ErrorAlertProps {
  title?: string;
  error: ParsedApiError | string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorAlert: React.FC<ErrorAlertProps> = ({
  title,
  error,
  onRetry,
  className,
}) => {
  const parsed: ParsedApiError =
    typeof error === 'string'
      ? {
          status: null,
          code: 'ERROR',
          message: error,
          details: [],
          isNetworkError: false,
          isNotImplemented: false,
        }
      : error;

  const heading =
    title ||
    (parsed.isNotImplemented
      ? 'Backend Endpoint Not Yet Implemented'
      : parsed.isNetworkError
      ? 'Backend Service Unreachable'
      : 'Request Error');

  return (
    <div
      role="alert"
      className={cn(
        'rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 text-sm text-rose-200',
        className
      )}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-semibold text-rose-100">{heading}</h4>
            <span className="px-2 py-0.5 rounded bg-rose-500/15 border border-rose-500/30 text-[10px] font-mono text-rose-300">
              {parsed.status ? `HTTP ${parsed.status} • ${parsed.code}` : parsed.code}
            </span>
          </div>
          <p className="mt-1 text-xs text-rose-200/90 leading-relaxed">{parsed.message}</p>

          {parsed.details.length > 0 && (
            <ul className="mt-2.5 space-y-1 border-t border-rose-500/20 pt-2 text-xs font-mono text-rose-300">
              {parsed.details.map((detail, idx) => (
                <li key={idx}>
                  {detail.field ? <span className="text-rose-100">{detail.field}: </span> : null}
                  {detail.issue}
                </li>
              ))}
            </ul>
          )}

          {onRetry && (
            <div className="mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={onRetry}
                leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                className="border-rose-500/30 text-rose-200 hover:bg-rose-500/10"
              >
                Retry Request
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
