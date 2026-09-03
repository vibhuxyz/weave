import { Component, type ReactNode } from "react";
import { AlertTriangleIcon } from "lucide-react";

export class BlockErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center gap-3 rounded-lg border border-agent-critical/20 bg-agent-critical-bg p-3 text-sm text-agent-critical-fg">
          <AlertTriangleIcon className="size-4 shrink-0" />
          <div className="flex-1 overflow-hidden">
            <p className="font-medium">Failed to render block</p>
            <p className="truncate text-xs opacity-70">{this.state.error?.message}</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
