import { memo } from "react";
import { cn } from "@/shared/lib";
import { laneViewOf, useRunStore } from "../store";
import { LaneWorkforce } from "./LaneWorkforce";
import { PHASE_CLASS, PHASE_LABEL, PHASE_MARK } from "./status-style";
import { WorkerProgress } from "./WorkerProgress";

function LaneCardView({ taskId }: { readonly taskId: string }) {
  const lanes = useRunStore((state) => state.run?.lanes);
  const lane = lanes?.[taskId];
  const view = lanes ? laneViewOf(lanes, taskId) : null;
  if (!lane || !view) return null;
  const needsFrom = lane.dependsOn.filter((producer) => !lane.startsAfter.includes(producer));
  return (
    <li className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-agent-border px-3 py-2.5" aria-label={`Lane ${lane.taskId}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-medium text-agent-text-bright text-xs">
          {lane.taskId} · {lane.title}
        </span>
        <span className={cn("shrink-0 text-[11px]", PHASE_CLASS[view.phase])}>
          <span aria-hidden="true">{PHASE_MARK[view.phase]} </span>
          {PHASE_LABEL[view.phase]}
          {lane.attempts > 1 && ` · attempt ${lane.attempts}`}
        </span>
      </div>
      {view.activity && <span className="truncate text-[11px] text-agent-text-muted">{view.activity}</span>}
      {view.waitingFor.length > 0 && (
        <span className="truncate text-[11px] text-agent-warn">Waiting: {view.waitingFor.join(", ")}</span>
      )}
      {view.changedFiles > 0 && (
        <span className="text-[11px] text-agent-text-faint">Files changed: {view.changedFiles}</span>
      )}
      {view.progress !== null && <WorkerProgress percent={view.progress} />}
      {lane.startsAfter.length > 0 && <span className="text-[11px] text-agent-text-faint">starts after {lane.startsAfter.join(", ")}</span>}
      {needsFrom.length > 0 && <span className="text-[11px] text-agent-text-faint">needs output from {needsFrom.join(", ")}</span>}
      {lane.allowedPaths.length > 0 && (
        <span className="truncate font-mono text-[11px] text-agent-text-faint" title={lane.allowedPaths.join(", ")}>may change {lane.allowedPaths.join(", ")}</span>
      )}
      {(lane.skills.length > 0 || lane.complexity) && (
        <span className="truncate text-[11px] text-agent-text-faint" title={lane.skills.join(", ")}>
          {lane.complexity && `${lane.complexity} complexity`}
          {lane.complexity && lane.skills.length > 0 && " · "}
          {lane.skills.length > 0 && `skills: ${lane.skills.join(", ")}`}
        </span>
      )}
      {lane.readOnlyPaths.length > 0 && (
        <span className="truncate font-mono text-[11px] text-agent-text-faint" title={lane.readOnlyPaths.join(", ")}>reads only {lane.readOnlyPaths.join(", ")}</span>
      )}
      {lane.produces.length > 0 && (
        <span className="truncate text-[11px] text-agent-text-faint" title={lane.produces.join(", ")}>publishes {lane.produces.join(", ")}</span>
      )}
      {(lane.plannedEngineId || lane.verifyRung) && (
        <span className="truncate text-[11px] text-agent-text-faint">
          {lane.plannedEngineId && `on ${lane.plannedEngineId}`}
          {lane.plannedEngineId && lane.verifyRung && " · "}
          {lane.verifyRung && `must pass ${lane.verifyRung}`}
        </span>
      )}
      <LaneWorkforce lane={lane} />
      {lane.wallMs !== null && (
        <span className="text-[11px] text-agent-text-faint">
          took {(lane.wallMs / 1000).toFixed(1)}s
          {lane.installMs !== null && lane.installMs > 0 && ` · install ${(lane.installMs / 1000).toFixed(1)}s`}
        </span>
      )}
      {lane.reason && <span className="text-[11px] text-agent-critical-fg">{lane.reason}</span>}
      {lane.reason === null && view.phase === "failed" && (
        <span className="text-[11px] text-agent-critical-fg">
          Failed without a reason. Run `bun run diagnose` for the full ledger.
        </span>
      )}
    </li>
  );
}

export const LaneCard = memo(LaneCardView);
