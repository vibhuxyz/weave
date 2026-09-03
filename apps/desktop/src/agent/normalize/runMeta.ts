import type { GitStatus } from "../../../server/index.ts";
import type { ToolEntry } from "../../useAcpChat";
import type { AgentRunMeta } from "./types";

/** Kinds that actually mutate a file — reads are counted separately. */
const MUTATING_TOOL_KINDS = new Set(["edit", "delete", "move"]);

export function runMetaFromTurn(options: {
  tools: ToolEntry[];
  git: GitStatus;
  status: AgentRunMeta["status"];
  configValues: Record<string, string>;
  engineId: string;
  engineLabel: string;
}): AgentRunMeta {
  const filesRead = options.tools.filter((tool) => tool.kind === "read").length;
  const mutatedToolFiles = options.tools.filter((tool) =>
    MUTATING_TOOL_KINDS.has(tool.kind),
  ).length;
  const filesChanged = Math.max(options.git.changes.length, mutatedToolFiles);
  const model =
    options.configValues.model ??
    options.configValues["claude.model"] ??
    options.configValues["anthropic.model"];

  return {
    provider: options.configValues.provider ?? "unknown",
    engine: options.engineId,
    engineLabel: options.engineLabel,
    model,
    filesRead,
    filesChanged,
    status: options.status,
  };
}

export interface StatusPill {
  mode: "read-only" | "ran-locally";
  label: string;
  tone: "neutral" | "problem";
}

/** The header pill: "read-only · N files · nothing changed" vs "ran locally · N problems". */
export function deriveStatusPill(meta: AgentRunMeta): StatusPill {
  if (meta.changed) {
    const n = meta.problemCount ?? 0;
    return {
      mode: "ran-locally",
      label:
        n > 0
          ? `ran locally · ${n} problem${n === 1 ? "" : "s"}`
          : `ran locally · ${meta.filesChanged} file${meta.filesChanged === 1 ? "" : "s"} changed`,
      tone: n > 0 ? "problem" : "neutral",
    };
  }
  return {
    mode: "read-only",
    label: `read-only · ${meta.filesRead} file${meta.filesRead === 1 ? "" : "s"} · nothing changed`,
    tone: "neutral",
  };
}

