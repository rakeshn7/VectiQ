import React from 'react';
import { AlertOctagon, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'An unexpected rendering error occurred.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[ErrorBoundary]:', error, info.componentStack);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, message: '' });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-6 text-center">
          <div className="mx-auto w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-3">
            <AlertOctagon className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-semibold text-rose-100">
            {this.props.fallbackTitle || 'Component Rendering Error'}
          </h3>
          <p className="mt-1 text-xs text-rose-300/90 max-w-md mx-auto">{this.state.message}</p>
          <div className="mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={this.handleReset}
              leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
            >
              Recover View
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
