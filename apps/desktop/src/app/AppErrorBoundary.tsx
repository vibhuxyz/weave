import { Component, type ReactNode } from "react";
import { AlertTriangleIcon } from "lucide-react";

interface AppErrorBoundaryState {
  readonly error: Error | null;
}

export class AppErrorBoundary extends Component<{ readonly children: ReactNode }, AppErrorBoundaryState> {
  constructor(props: { readonly children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div role="alert" className="flex h-screen w-screen items-center justify-center bg-background p-8 text-foreground">
        <div className="flex max-w-lg flex-col gap-3 rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangleIcon className="size-4 shrink-0 text-destructive" />
            Weave hit an error while drawing this screen
          </div>
          <p className="break-words font-mono text-muted-foreground text-xs">{error.message}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => this.setState({ error: null })} className="rounded-md border border-border px-3 py-1 text-sm hover:bg-secondary">
              Try again
            </button>
            <button type="button" onClick={() => window.location.reload()} className="rounded-md border border-border px-3 py-1 text-sm hover:bg-secondary">
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
