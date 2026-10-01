import { randomUUID } from "node:crypto";
import type { McpServer } from "@agentclientprotocol/sdk";
import type { TeamEstimate } from "@weave/core";
import { ESTIMATE_TOOL_NAME, MCP_PATH_PREFIX, MCP_SERVER_NAME } from "./constants.ts";
import { runEstimateTool, type EstimateToolDeps } from "./estimate-tool.ts";
import type { TeamToolHost, TurnEstimates } from "./types.ts";

export interface ConnectionTools extends TurnEstimates {
  readonly mcpServers: readonly McpServer[];
  readonly close: () => void;
}

export function openConnectionTools(host: TeamToolHost, deps: EstimateToolDeps): ConnectionTools {
  const token = randomUUID();
  const state: { estimate: TeamEstimate | null } = { estimate: null };
  const close = host.registry.register(token, async (name, args) => {
    if (name !== ESTIMATE_TOOL_NAME) return { text: `Unknown tool ${name}; this server offers ${ESTIMATE_TOOL_NAME}.`, isError: true };
    const ran = await runEstimateTool(args, deps);
    if (ran.estimate) state.estimate = ran.estimate;
    return ran.result;
  });
  return {
    mcpServers: [{ type: "http", name: MCP_SERVER_NAME, url: `${host.baseUrl()}${MCP_PATH_PREFIX}${token}`, headers: [] }],
    clear: () => {
      state.estimate = null;
    },
    latest: () => state.estimate,
    close,
  };
}
