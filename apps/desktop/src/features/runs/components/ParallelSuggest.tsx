interface ParallelSuggestProps {
  readonly visible: boolean;
  readonly onRun: () => void;
}

export function ParallelSuggest({ visible, onRun }: ParallelSuggestProps) {
  if (!visible) return null;
  return (
    <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-1 text-xs text-agent-text-muted">
      <span>This asks for workers. Weave can run them as a team.</span>
      <button type="button" onClick={onRun} className="shrink-0 rounded-full border border-agent-border px-3 py-1 text-agent-text-bright transition-colors hover:bg-secondary/60">
        Run with /parallel?
      </button>
    </div>
  );
}
