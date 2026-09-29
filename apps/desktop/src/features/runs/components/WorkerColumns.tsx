import { useMemo } from "react";
import { cn } from "@/shared/lib";
import { MAX_WORKER_COLUMNS } from "../constants";
import { NO_LANE_ORDER, NO_LANES, NO_STREAM, useRunStore, workerPanes } from "../store";
import type { WorkerPane } from "../store";
import { LANE_STATUS_CLASS, LANE_STATUS_LABEL } from "./status-style";
import { StreamBlockView } from "./StreamBlockView";

const COLUMN_CLASS: Readonly<Record<number, string>> = {
  1: "grid-cols-1",
  2: "grid-cols-1 lg:grid-cols-2",
  3: "grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3",
};

function columnsFor(count: number): string {
  return COLUMN_CLASS[Math.min(count, MAX_WORKER_COLUMNS)] ?? COLUMN_CLASS[MAX_WORKER_COLUMNS] ?? "grid-cols-1";
}

function PaneRow({ pane }: { readonly pane: WorkerPane }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 text-[11px]">
      <span className="font-medium text-agent-text-bright">{pane.taskId}</span>
      <span className="truncate text-agent-text-muted">{pane.title}</span>
      {pane.waitingFor === null ? (
        <span className={cn("ml-auto shrink-0", LANE_STATUS_CLASS[pane.status])}>{LANE_STATUS_LABEL[pane.status]}</span>
      ) : (
        <span className="text-agent-text-faint">waiting for {pane.waitingFor}</span>
      )}
    </li>
  );
}

function PaneList({ panes, label }: { readonly panes: readonly WorkerPane[]; readonly label: string }) {
  if (panes.length === 0) return null;
  return (
    <div className="flex flex-col gap-1" role="group" aria-label={label}>
      <span className="text-[11px] text-agent-text-faint">{label}</span>
      <ul className="flex flex-col gap-1">
        {panes.map((pane) => <PaneRow key={pane.taskId} pane={pane} />)}
      </ul>
    </div>
  );
}

export function WorkerColumns() {
  // Each of these is one stable reference from the store; the panes are then
  // derived once per change instead of on every render.
  const lanes = useRunStore((state) => state.run?.lanes ?? NO_LANES);
  const laneOrder = useRunStore((state) => state.run?.laneOrder ?? NO_LANE_ORDER);
  const stream = useRunStore((state) => state.run?.stream ?? NO_STREAM);
  const { live, waiting, done } = useMemo(() => workerPanes(lanes, laneOrder, stream), [lanes, laneOrder, stream]);
  const shown = live.slice(0, MAX_WORKER_COLUMNS);
  const overflow = live.slice(MAX_WORKER_COLUMNS);
  if (live.length + waiting.length + done.length === 0) return null;
  return (
    <div className="flex flex-col gap-4">
      {shown.length > 0 && (
        <div className={cn("grid gap-4", columnsFor(shown.length))} aria-label={`${live.length} workers running`}>
          {shown.map((pane) => (
            <div key={pane.taskId} className="min-w-0 rounded-xl border border-agent-border/60 p-3">
              {pane.block ? (
                <StreamBlockView block={pane.block} plannerLabel={null} isPlanning={false} />
              ) : (
                <PaneRow pane={pane} />
              )}
            </div>
          ))}
        </div>
      )}
      <PaneList panes={overflow} label={`${overflow.length} more running`} />
      <PaneList panes={waiting} label="Waiting" />
      <PaneList panes={done} label="Finished" />
    </div>
  );
}
