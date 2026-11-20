import React from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'An unexpected error occurred.',
    };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Application ErrorBoundary caught:', error, info);
  }

  override render() {
    if (this.state.hasError) {
      let friendly = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message);
        if (parsed && typeof parsed.error === 'string') {
          friendly = `Database access error (${parsed.operationType || 'read/write'}): ${parsed.error}`;
        }
      } catch {
        // Plain text error
      }

      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
          <div className="w-full max-w-md rounded-xl border border-rose-500/40 border-t-2 border-t-rose-500 bg-slate-900 p-6 shadow-xl">
            <div className="flex items-center gap-2.5 text-rose-400">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <h2 className="font-display text-base font-bold">Something went wrong</h2>
            </div>
            <p className="mt-3 break-words font-mono text-xs leading-5 text-slate-300">
              {friendly}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
            >
              <RotateCw className="h-3.5 w-3.5" />
              Reload App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
