import type { SessionUpdate } from "@agentclientprotocol/sdk";
import { type AgentBlock, type AgentBlockBase, emptySource } from "./types";

export interface SourceEventRef {
  runId?: string;
  seq?: number;
}

export function blockBase(
  id: string,
  source?: SourceEventRef,
): AgentBlockBase {
  const sourceEventIds =
    source?.runId && source.seq !== undefined
      ? [`${source.runId}:${source.seq}`]
      : undefined;
  return {
    id,
    schemaVersion: 1,
    source: emptySource(sourceEventIds, source?.seq),
    sourceEventIds,
    sourceSeq: source?.seq,
  };
}

export function eventToBlock(
  update: SessionUpdate,
  source?: SourceEventRef,
): AgentBlock | null {
  if (update.sessionUpdate === "tool_call") {
    return {
      ...blockBase(`tool-${update.toolCallId}`, source),
      type: "tool",
      tool: {
        id: update.toolCallId,
        title: update.title,
        status: update.status ?? "pending",
        kind: update.kind ?? "other",
        sourceEventIds:
          source?.runId && source.seq !== undefined
            ? [`${source.runId}:${source.seq}`]
            : undefined,
        sourceSeq: source?.seq,
      },
    };
  }

  return null;
}

