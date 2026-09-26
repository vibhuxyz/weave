import { memo } from "react";
import { cn } from "@/shared/lib";
import { useRunStore } from "../store";
import { LaneWorkforce } from "./LaneWorkforce";
import { LANE_STATUS_CLASS, LANE_STATUS_LABEL } from "./status-style";

function LaneCardView({ taskId }: { readonly taskId: string }) {
  const lane = useRunStore((state) => state.run?.lanes[taskId]);
  if (!lane) return null;
  return (
    <li className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-agent-border px-3 py-2.5" aria-label={`Lane ${lane.taskId}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-medium text-agent-text-bright text-xs">
          {lane.taskId} · {lane.title}
        </span>
        <span className={cn("shrink-0 text-[11px]", LANE_STATUS_CLASS[lane.status])}>
          {LANE_STATUS_LABEL[lane.status]}
          {lane.attempts > 1 && ` · attempt ${lane.attempts}`}
        </span>
      </div>
      {lane.dependsOn.length > 0 && <span className="text-[11px] text-agent-text-faint">after {lane.dependsOn.join(", ")}</span>}
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
      {lane.reason && <span className="text-[11px] text-agent-critical-fg">{lane.reason}</span>}
    </li>
  );
}

export const LaneCard = memo(LaneCardView);
