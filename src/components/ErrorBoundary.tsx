import React, { ErrorInfo, ReactNode } from 'react';
import { ShieldAlert, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    const { hasError, error } = this.state;
    const { children } = (this as any).props;

    if (hasError) {
      let errorMessage = "Something went wrong. Please try again later.";
      let isPermissionError = false;

      try {
        if (error?.message) {
          const parsed = JSON.parse(error.message);
          if (parsed.error && parsed.error.includes('insufficient permissions')) {
            errorMessage = "You don't have permission to perform this action. Please check your account status.";
            isPermissionError = true;
          }
        }
      } catch (e) {
        // Not a JSON error, use default
      }

      return (
        <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-3xl p-8 text-center shadow-2xl">
            <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <ShieldAlert className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-4">Application Error</h2>
            <p className="text-neutral-400 mb-8 leading-relaxed">
              {errorMessage}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full flex items-center justify-center gap-2 bg-white text-black font-bold py-4 rounded-2xl hover:bg-emerald-500 hover:text-white transition-all duration-300"
            >
              <RefreshCw className="w-5 h-5" />
              Reload Application
            </button>
            {isPermissionError && (
              <p className="mt-4 text-xs text-neutral-600 uppercase tracking-widest font-bold">
                Security Violation Detected
              </p>
            )}
          </div>
        </div>
      );
    }

    return children;
  }
}
