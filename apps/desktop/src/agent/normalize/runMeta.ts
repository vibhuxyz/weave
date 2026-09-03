import type { GitStatus } from "../../../server/index.ts";
import type { ToolEntry } from "../../useAcpChat";
import type { AgentRunMeta } from "./types";

const FILE_TOOL_KINDS = new Set(["read", "edit", "delete", "move"]);

export function runMetaFromTurn(options: {
  tools: ToolEntry[];
  git: GitStatus;
  status: AgentRunMeta["status"];
  configValues: Record<string, string>;
  engineId: string;
  engineLabel: string;
}): AgentRunMeta {
  const filesRead = options.tools.filter((tool) => tool.kind === "read").length;
  const touchedToolFiles = options.tools.filter((tool) =>
    FILE_TOOL_KINDS.has(tool.kind),
  ).length;
  const filesChanged = Math.max(options.git.changes.length, touchedToolFiles);
  const model =
    options.configValues.model ??
    options.configValues["claude.model"] ??
    options.configValues["anthropic.model"];

  return {
    engine: options.engineId,
    engineLabel: options.engineLabel,
    model,
    filesRead,
    filesChanged,
    status: options.status,
  };
}

