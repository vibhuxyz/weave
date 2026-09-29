import { useRunStore } from "../store";
import { runSummaryOf } from "../store";

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

export function durationText(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / MS_PER_SECOND));
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  return minutes === 0 ? `${seconds}s` : `${minutes}m ${seconds % SECONDS_PER_MINUTE}s`;
}

export function RunSummary() {
  const run = useRunStore((state) => state.run);
  if (!run) return null;
  const summary = runSummaryOf(run, Date.now());
  return (
    <span className="text-[11px] text-agent-text-faint">
      {summary.workers} worker{summary.workers === 1 ? "" : "s"} · {summary.completed}/{summary.tasks} tasks ·{" "}
      {summary.progress}% · {durationText(summary.durationMs)}
    </span>
  );
}
