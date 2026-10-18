import { useState } from "react";
import type { TurnRunLane, TurnRunSummary } from "@/features/chat/hooks";
import { useEmployeeListing, type EmployeeListing } from "@/features/employees";
import { DisclosureHeader } from "./DisclosureHeader";

const MS_PER_SECOND = 1_000;
const SECONDS_PER_MINUTE = 60;
const COST_DECIMALS = 2;

const LANE_STATUS_TEXT = {
  waiting: "Waiting",
  running: "Running",
  ok: "Done",
  failed: "Failed",
  rejected: "Rejected",
  cancelled: "Cancelled",
} as const satisfies Record<TurnRunSummary["lanes"][number]["status"], string>;

function durationText(durationMs: number): string {
  const seconds = Math.round(durationMs / MS_PER_SECOND);
  if (seconds < SECONDS_PER_MINUTE) return `${seconds}s`;
  return `${Math.floor(seconds / SECONDS_PER_MINUTE)}m ${seconds % SECONDS_PER_MINUTE}s`;
}

function summaryText(run: TurnRunSummary): string {
  const workers = `${run.lanes.length} task${run.lanes.length === 1 ? "" : "s"}`;
  return `Run details · ${workers} · ${durationText(run.durationMs)} · $${run.costUsd.toFixed(COST_DECIMALS)}`;
}

function laneEmployeeName(lane: TurnRunLane, listing: EmployeeListing): string | null {
  const id = lane.employeeId;
  if (id === undefined) return null;
  if (id === null) return "no employee";
  if (listing.status !== "ready") return id;
  return listing.entries.find((entry) => entry.employee.id === id)?.employee.name ?? id;
}

export function RunDetails({ run }: { readonly run: TurnRunSummary }) {
  const [isOpen, setIsOpen] = useState(false);
  const listing = useEmployeeListing();
  return (
    <section className="flex flex-col gap-2" aria-label="Run details">
      <DisclosureHeader open={isOpen} onToggle={() => setIsOpen((current) => !current)}>
        {summaryText(run)}
      </DisclosureHeader>
      {isOpen && (
        <div className="flex flex-col gap-2 text-xs text-agent-text-muted">
          <p>{run.outcomeText}</p>
          <ul className="flex flex-col gap-0.5">
            {run.lanes.map((lane) => {
              const employee = laneEmployeeName(lane, listing);
              return (
                <li key={lane.taskId} className="flex min-w-0 items-baseline gap-2">
                  <span className="shrink-0 font-medium text-agent-text-bright">{lane.taskId}</span>
                  <span className="truncate">{lane.title}</span>
                  {employee && <span className="shrink-0 text-agent-text-faint">by {employee}</span>}
                  <span className="ml-auto shrink-0 text-agent-text-faint">{LANE_STATUS_TEXT[lane.status]} · {lane.changedFiles} files</span>
                </li>
              );
            })}
          </ul>
          {run.files.length > 0 && (
            <ul className="flex flex-col gap-0.5 font-mono text-[11px] text-agent-text-faint">
              {run.files.map((path) => (
                <li key={path} className="truncate">{path}</li>
              ))}
              {run.hiddenFileCount > 0 && <li>(+{run.hiddenFileCount} more files)</li>}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
