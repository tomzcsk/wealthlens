import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryState {
  error: Error | null;
  info: ErrorInfo | null;
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ info });
    console.error('[WealthLens] ErrorBoundary caught:', error, info);
  }

  handleReset = (): void => {
    this.setState({ error: null, info: null });
  };

  handleClearStorage = (): void => {
    try {
      localStorage.removeItem('wealthlens_data');
      localStorage.removeItem('wealthlens_auth');
    } catch {
      /* ignore */
    }
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen bg-slate-50 p-8 flex items-start justify-center">
        <div className="max-w-3xl w-full bg-white border border-red-200 rounded-2xl shadow-lg p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">⚠️</span>
            <h1 className="text-xl font-bold text-red-700">
              WealthLens ขัดข้อง
            </h1>
          </div>

          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-700">
              ข้อความผิดพลาด
            </h2>
            <pre className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-900 overflow-x-auto whitespace-pre-wrap">
              {this.state.error.message}
            </pre>
          </div>

          {this.state.error.stack && (
            <details className="space-y-2">
              <summary className="text-sm font-semibold text-slate-700 cursor-pointer">
                Stack trace
              </summary>
              <pre className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-700 overflow-x-auto whitespace-pre-wrap">
                {this.state.error.stack}
              </pre>
            </details>
          )}

          {this.state.info?.componentStack && (
            <details className="space-y-2">
              <summary className="text-sm font-semibold text-slate-700 cursor-pointer">
                Component stack
              </summary>
              <pre className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-700 overflow-x-auto whitespace-pre-wrap">
                {this.state.info.componentStack}
              </pre>
            </details>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={this.handleReset}
              className="px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-sm"
            >
              ลองใหม่
            </button>
            <button
              type="button"
              onClick={this.handleClearStorage}
              className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 text-sm"
            >
              ล้างข้อมูลในเครื่อง + โหลดใหม่
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
