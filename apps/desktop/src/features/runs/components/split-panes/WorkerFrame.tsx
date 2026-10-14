import { cn } from "@/shared/lib";

const MAX_ACTIVITY_CHARS = 80;
import type { WorkerPane } from "../../store";
import { StreamBlockView } from "../StreamBlockView";
import { LANE_STATUS_CLASS, LANE_STATUS_LABEL } from "../status-style";

interface WorkerFrameProps {
  readonly pane: WorkerPane;
  readonly projectDir: string | null;
  readonly onOpenDiff?: (turnId: string, path?: string) => void;
  readonly onResume?: (taskId: string) => void;
}

function statusText(pane: WorkerPane): string {
  if (pane.waitingFor !== null) return `Waiting for ${pane.waitingFor}`;
  if (pane.activity && pane.status === "running") {
    return pane.activity.length > MAX_ACTIVITY_CHARS ? `${pane.activity.slice(0, MAX_ACTIVITY_CHARS)}…` : pane.activity;
  }
  return LANE_STATUS_LABEL[pane.status];
}

export function WorkerFrame({ pane, projectDir, onOpenDiff, onResume }: WorkerFrameProps) {
  return (
    <section className="flex h-full min-h-0 flex-col bg-background" aria-label={`Worker ${pane.taskId}`}>
      <header className="flex h-8 shrink-0 items-center gap-2 border-b border-agent-border px-2.5 text-[11px]">
        <span className={cn("size-1.5 shrink-0 rounded-full bg-current", LANE_STATUS_CLASS[pane.status])} aria-hidden="true" />
        <span className="font-medium text-agent-text-bright">{pane.taskId}</span>
        <span className="min-w-0 flex-1 truncate text-agent-text-muted">{pane.title}</span>
        <span className={cn("max-w-[45%] truncate", pane.waitingFor === null ? LANE_STATUS_CLASS[pane.status] : "text-agent-text-faint")}>{statusText(pane)}</span>
        {pane.status === "failed" && onResume && (
          <button type="button" onClick={() => onResume(pane.taskId)} className="shrink-0 rounded border border-agent-border px-1.5 py-0.5 text-agent-text-bright hover:bg-secondary/60">
            Resume
          </button>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {pane.block === null ? (
          <p className="text-[11px] text-agent-text-faint">{statusText(pane)}</p>
        ) : (
          <StreamBlockView block={pane.block} plannerLabel={null} isPlanning={false} projectDir={projectDir} onOpenDiff={onOpenDiff} showHeader={false} />
        )}
      </div>
    </section>
  );
}
