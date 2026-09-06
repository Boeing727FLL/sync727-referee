/**
 * ErrorBoundary — last-resort crash screen (class component, the only API
 * React offers for render-error catching).
 *
 * WHAT: wraps the whole app in main-app.tsx. Any uncaught render error
 * anywhere swaps the tree for one calm card: apology, technical detail,
 * single reload button. Copy stays plain and kid-readable on purpose.
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

// ---------------------------------------------------------------------------
// The boundary
// ---------------------------------------------------------------------------

export class ErrorBoundary extends Component<Props, State> {
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
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-4" dir="rtl">
          <div className="max-w-md w-full bg-slate-900/90 backdrop-blur-2xl p-6 md:p-8 rounded-[24px] shadow-[0_20px_60px_rgba(0,0,0,0.5)] border border-red-500/20 text-center">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-red-500/12 border border-red-500/25 flex items-center justify-center text-2xl font-black text-red-400" aria-hidden>
              !
            </div>
            <h2 className="text-xl font-black tracking-tight">משהו השתבש</h2>
            <p className="text-slate-400 text-sm leading-relaxed mt-2 mb-4">
              אירעה שגיאה בטעינת האפליקציה. אנא נסה לרענן את העמוד.
            </p>
            <div className="bg-slate-950/70 border border-white/[0.07] p-4 rounded-2xl overflow-auto max-h-40 mb-5 text-xs font-mono text-red-300/80 text-left" dir="ltr">
              {this.state.error?.message}
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-gradient-to-b from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white font-black py-3.5 px-6 rounded-2xl transition-all active:scale-[0.98] cursor-pointer shadow-[0_8px_24px_rgba(239,68,68,0.3)]"
            >
              רענן עמוד
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
