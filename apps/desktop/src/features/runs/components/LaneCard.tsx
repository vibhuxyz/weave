import { memo } from "react";
import { cn } from "@/shared/lib";
import { useRunStore } from "../store";
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
      {lane.tools.length > 0 && (
        <ul className="flex flex-col gap-0.5 font-mono text-[11px] text-agent-text-muted">
          {lane.tools.map((tool) => (
            <li key={tool.id} className="truncate">{tool.title}</li>
          ))}
        </ul>
      )}
      {lane.text && <p className="line-clamp-3 whitespace-pre-wrap text-agent-text text-xs">{lane.text}</p>}
      {lane.files.length > 0 && (
        <span className="truncate text-[11px] text-agent-text-faint">
          {lane.files.length + lane.hiddenFileCount} files: {lane.files.join(", ")}
          {lane.hiddenFileCount > 0 && ` (+${lane.hiddenFileCount} more)`}
        </span>
      )}
      {lane.reason && <span className="text-[11px] text-agent-critical-fg">{lane.reason}</span>}
      {lane.merge && <span className="text-[11px] text-agent-text-muted">merge: {lane.merge.status}</span>}
    </li>
  );
}

export const LaneCard = memo(LaneCardView);
