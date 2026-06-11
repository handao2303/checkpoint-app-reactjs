import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Catches render-time crashes (including failed lazy-chunk loads) so the app
 *  shows a recoverable message instead of a blank white screen. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface for diagnosis; replace with real reporting later if needed.
    console.error("App crashed:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <img src="/pin.svg" alt="" className="h-12 w-12 opacity-60" />
        <div>
          <h1 className="font-display text-xl font-bold text-foreground">Có lỗi xảy ra</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ứng dụng gặp sự cố khi tải. Vui lòng thử lại.
          </p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="rounded-full bg-primary px-6 py-2.5 font-semibold text-primary-foreground shadow-cta"
        >
          Tải lại
        </button>
      </div>
    );
  }
}
