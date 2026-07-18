import React, { Component, ErrorInfo, ReactNode } from 'react';

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
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white p-4">
          <div className="max-w-md w-full bg-slate-800 p-6 rounded-2xl shadow-xl border border-red-500/20">
            <h2 className="text-2xl font-bold text-red-400 mb-4">משהו השתבש</h2>
            <p className="text-slate-300 mb-4">
              אירעה שגיאה בטעינת האפליקציה. אנא נסה לרענן את העמוד.
            </p>
            <div className="bg-slate-950 p-4 rounded-lg overflow-auto max-h-40 mb-6 text-xs font-mono text-red-300/80">
              {this.state.error?.message}
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-6 rounded-xl transition-colors"
            >
              רענן עמוד
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}
