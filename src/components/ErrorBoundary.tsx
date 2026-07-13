import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useFinanceStore } from '../stores/financeStore';
import { clearAuthData } from '../auth/useGoogleAuth';

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
      // Route through each store's own reset so the storage key/engine stays
      // an implementation detail of the persist layer, not this component.
      useFinanceStore.getState().clearPersistedData();
      clearAuthData();
    } catch {
      /* ignore */
    }
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen bg-surface p-8 flex items-start justify-center">
        <div className="max-w-3xl w-full bg-card border border-expense-200 rounded-2xl shadow-lg p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">⚠️</span>
            <h1 className="text-xl font-bold text-expense-700">
              WealthLens ขัดข้อง
            </h1>
          </div>

          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-ink-700">
              ข้อความผิดพลาด
            </h2>
            <pre className="bg-expense-50 border border-expense-200 rounded-lg p-3 text-xs text-expense-900 overflow-x-auto whitespace-pre-wrap">
              {this.state.error.message}
            </pre>
          </div>

          {this.state.error.stack && (
            <details className="space-y-2">
              <summary className="text-sm font-semibold text-ink-700 cursor-pointer">
                Stack trace
              </summary>
              <pre className="bg-surface border border-ink-200 rounded-lg p-3 text-xs text-ink-700 overflow-x-auto whitespace-pre-wrap">
                {this.state.error.stack}
              </pre>
            </details>
          )}

          {this.state.info?.componentStack && (
            <details className="space-y-2">
              <summary className="text-sm font-semibold text-ink-700 cursor-pointer">
                Component stack
              </summary>
              <pre className="bg-surface border border-ink-200 rounded-lg p-3 text-xs text-ink-700 overflow-x-auto whitespace-pre-wrap">
                {this.state.info.componentStack}
              </pre>
            </details>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={this.handleReset}
              className="px-4 py-2 rounded-lg border border-ink-200 hover:bg-hover text-sm"
            >
              ลองใหม่
            </button>
            <button
              type="button"
              onClick={this.handleClearStorage}
              className="px-4 py-2 rounded-lg bg-expense text-white hover:bg-expense-dark text-sm"
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
