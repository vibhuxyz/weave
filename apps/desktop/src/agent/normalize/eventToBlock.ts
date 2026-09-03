import type { SessionUpdate } from "@agentclientprotocol/sdk";
import type { AgentBlock, AgentBlockBase } from "./types";

export interface SourceEventRef {
  runId?: string;
  seq?: number;
}

export function blockBase(
  id: string,
  source?: SourceEventRef,
): AgentBlockBase {
  return {
    id,
    schemaVersion: 1,
    sourceEventIds:
      source?.runId && source.seq !== undefined
        ? [`${source.runId}:${source.seq}`]
        : undefined,
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

