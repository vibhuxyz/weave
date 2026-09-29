const BAR_SEGMENTS = 10;

export function WorkerProgress({ percent }: { readonly percent: number }) {
  const filled = Math.round((Math.min(100, Math.max(0, percent)) / 100) * BAR_SEGMENTS);
  return (
    <div className="flex items-center gap-2" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <span className="font-mono text-[11px] text-agent-progress-fg" aria-hidden="true">
        {"█".repeat(filled)}
        <span className="text-agent-text-faint">{"░".repeat(BAR_SEGMENTS - filled)}</span>
      </span>
      <span className="text-[11px] text-agent-text-faint">{percent}%</span>
    </div>
  );
}
