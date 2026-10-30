import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught component error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  private handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', '/printers/0');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="w-full max-w-2xl mx-auto my-8 p-6 bg-[#1E1E1E] border border-[#EF4444]/40 rounded-2xl shadow-xl flex flex-col items-center text-center gap-4">
          <div className="p-3 bg-[#EF4444]/15 text-[#EF4444] rounded-full border border-[#EF4444]/30">
            <AlertTriangle size={32} />
          </div>

          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-bold text-[#F3F4F6]">
              {this.props.fallbackTitle || 'Something went wrong in this view'}
            </h2>
            <p className="text-xs text-[#94A3B8] max-w-md">
              An unexpected error occurred while rendering this component. The rest of YourPrinter is still running safely.
            </p>
          </div>

          {this.state.error && (
            <div className="w-full bg-[#121212] border border-[#2E2E2E] rounded-lg p-3 text-left">
              <p className="text-xs font-mono text-[#EF4444] break-all">
                {this.state.error.name}: {this.state.error.message}
              </p>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={this.handleReset}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#262626] border border-[#2E2E2E] hover:border-[#383838] text-xs font-semibold text-[#F3F4F6] transition-colors"
            >
              <RefreshCw size={14} />
              <span>Try Again</span>
            </button>
            <button
              onClick={this.handleGoHome}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#00AE42] hover:bg-[#009638] text-xs font-semibold text-white transition-colors"
            >
              <Home size={14} />
              <span>Return to Dashboard</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
