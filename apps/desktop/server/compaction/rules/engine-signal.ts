import type { SessionUpdate } from "@weave/protocol";
import { CONTEXT_COMPACTION_META_KEY } from "../constants.ts";
import type { EngineCompactionStatus } from "../types.ts";

function hasCompactionMeta(meta: unknown): boolean {
  return typeof meta === "object" && meta !== null && CONTEXT_COMPACTION_META_KEY in meta;
}

export function engineCompactionStatus(update: SessionUpdate): EngineCompactionStatus | null {
  if (update.sessionUpdate !== "tool_call" && update.sessionUpdate !== "tool_call_update") return null;
  if (!hasCompactionMeta(update._meta)) return null;
  const status = update.status;
  switch (status) {
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "pending":
    case "in_progress":
      return "in_progress";
    case null:
    case undefined:
      return null;
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}
