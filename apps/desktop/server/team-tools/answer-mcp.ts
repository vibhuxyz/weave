import { DEFAULT_MCP_PROTOCOL_VERSION, ESTIMATE_TOOL_DEFINITION, JSON_RPC_ERRORS, JSON_RPC_VERSION, MCP_SERVER_NAME, MCP_SERVER_VERSION } from "./constants.ts";
import type { JsonRpcId, ToolRunner } from "./types.ts";

interface RpcRequest {
  readonly id?: JsonRpcId;
  readonly method: string;
  readonly params?: Readonly<Record<string, unknown>>;
}

function fieldsOf(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Readonly<Record<string, unknown>>) : null;
}

function asRequest(message: unknown): RpcRequest | null {
  const fields = fieldsOf(message);
  if (fields?.jsonrpc !== JSON_RPC_VERSION || typeof fields.method !== "string") return null;
  const id = fields.id;
  const isId = id === undefined || id === null || typeof id === "string" || typeof id === "number";
  return isId ? { id: id as JsonRpcId | undefined, method: fields.method, params: fieldsOf(fields.params) ?? undefined } : null;
}

export function rpcError(id: JsonRpcId, code: number, message: string): object {
  return { jsonrpc: JSON_RPC_VERSION, id, error: { code, message } };
}

function rpcResult(id: JsonRpcId, result: object): object {
  return { jsonrpc: JSON_RPC_VERSION, id, result };
}

async function callTool(id: JsonRpcId, params: RpcRequest["params"], run: ToolRunner): Promise<object> {
  const name = params?.name;
  if (typeof name !== "string") return rpcError(id, JSON_RPC_ERRORS.invalidParams, 'tools/call needs a "name"');
  const outcome = await run(name, params?.arguments ?? {});
  return rpcResult(id, { content: [{ type: "text", text: outcome.text }], isError: outcome.isError });
}

export async function answerMcp(message: unknown, run: ToolRunner): Promise<object | null> {
  const request = asRequest(message);
  if (request === null) return rpcError(null, JSON_RPC_ERRORS.invalidRequest, "Not a JSON-RPC 2.0 request");
  if (request.id === undefined) return null;
  const { id, params } = request;
  switch (request.method) {
    case "initialize": {
      const requested = params?.protocolVersion;
      const protocolVersion = typeof requested === "string" ? requested : DEFAULT_MCP_PROTOCOL_VERSION;
      return rpcResult(id, { protocolVersion, capabilities: { tools: {} }, serverInfo: { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION } });
    }
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, { tools: [ESTIMATE_TOOL_DEFINITION] });
    case "tools/call":
      return callTool(id, params, run);
    default:
      return rpcError(id, JSON_RPC_ERRORS.methodNotFound, `Unknown method ${request.method}`);
  }
}
