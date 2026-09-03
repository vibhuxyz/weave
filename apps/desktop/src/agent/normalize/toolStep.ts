import type { ToolEntry } from "../../useAcpChat";
import type { ActivityItem } from "./types";

export function toolToActivity(tool: ToolEntry): ActivityItem {
  return {
    id: `activity-${tool.id}`,
    schemaVersion: 1,
    sourceEventIds: tool.sourceEventIds,
    sourceSeq: tool.sourceSeq,
    label: tool.title,
    status: tool.status,
    kind: tool.kind,
  };
}

