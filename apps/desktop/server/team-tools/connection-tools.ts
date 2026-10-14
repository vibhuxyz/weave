import { randomUUID } from "node:crypto";
import type { McpServer } from "@agentclientprotocol/sdk";
import type { TeamEstimate } from "@weave/core";
import { ESTIMATE_TOOL_NAME, MCP_PATH_PREFIX, MCP_SERVER_NAME } from "./constants.ts";
import { runEstimateTool, type EstimateToolDeps } from "./estimate-tool.ts";
import { createHandoffSlot, HANDOFF_TOOL_NAME } from "./handoff-tool.ts";
import type { TeamToolHost, TurnEstimates, TurnHandoff } from "./types.ts";

export interface ConnectionTools extends TurnEstimates, TurnHandoff {
  readonly mcpServers: readonly McpServer[];
  readonly close: () => void;
}

export function openConnectionTools(host: TeamToolHost, deps: EstimateToolDeps): ConnectionTools {
  const token = randomUUID();
  const state: { estimate: TeamEstimate | null } = { estimate: null };
  const handoff = createHandoffSlot();
  const offered = `${ESTIMATE_TOOL_NAME} and ${HANDOFF_TOOL_NAME}`;
  const close = host.registry.register(token, async (name, args) => {
    if (name === HANDOFF_TOOL_NAME) return handoff.submit(args);
    if (name !== ESTIMATE_TOOL_NAME) return { text: `Unknown tool ${name}; this server offers ${offered}.`, isError: true };
    const ran = await runEstimateTool(args, deps);
    if (ran.estimate) state.estimate = ran.estimate;
    return ran.result;
  });
  return {
    mcpServers: [{ type: "http", name: MCP_SERVER_NAME, url: `${host.baseUrl()}${MCP_PATH_PREFIX}${token}`, headers: [] }],
    clear: () => { state.estimate = null; },
    latest: () => state.estimate,
    allowHandoff: handoff.allow,
    clearHandoff: handoff.clear,
    submitHandoff: handoff.submit,
    currentHandoff: handoff.current,
    whenHandoff: handoff.whenAccepted,
    close,
  };
}
