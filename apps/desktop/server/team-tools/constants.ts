export const MCP_PATH_PREFIX = "/mcp/";
export const MCP_SERVER_NAME = "weave";
export const MCP_SERVER_VERSION = "1";
export const DEFAULT_MCP_PROTOCOL_VERSION = "2025-06-18";
export const MAX_MCP_BODY_BYTES = 64 * 1024;

export const ESTIMATE_TOOL_NAME = "estimate_team";
export const TEAM_ESTIMATE_MAX_WORKERS = 4;

export const JSON_RPC_VERSION = "2.0";
export const JSON_RPC_ERRORS = { parse: -32700, invalidRequest: -32600, methodNotFound: -32601, invalidParams: -32602 } as const;
export const HTTP_STATUS = { ok: 200, accepted: 202, notFound: 404, methodNotAllowed: 405, tooLarge: 413 } as const;

export const ESTIMATE_TOOL_DEFINITION = {
  name: ESTIMATE_TOOL_NAME,
  description:
    "Decide whether the rest of this job should be finished by a team of workers running at the same time. Pass each remaining piece of work and the files or folders it will change. Weave groups independent parts by the project's workspaces and imports, proposes a worker list with roles and order, and estimates the time for one worker and for the team.",
  inputSchema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          properties: {
            description: { type: "string", description: "One remaining piece of work" },
            paths: { type: "array", minItems: 1, items: { type: "string" }, description: "Files or folders it will change, relative to the project root" },
          },
          required: ["description", "paths"],
        },
      },
    },
    required: ["items"],
  },
} as const;
