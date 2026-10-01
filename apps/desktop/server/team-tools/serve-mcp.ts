import type { IncomingMessage, ServerResponse } from "node:http";
import { answerMcp, rpcError } from "./answer-mcp.ts";
import { HTTP_STATUS, JSON_RPC_ERRORS, MAX_MCP_BODY_BYTES, MCP_PATH_PREFIX } from "./constants.ts";
import type { TeamToolRegistry, ToolRunner } from "./types.ts";

type Body = { readonly ok: true; readonly text: string } | { readonly ok: false };

export function isMcpRequest(url: string | undefined): boolean {
  return url?.startsWith(MCP_PATH_PREFIX) === true;
}

async function readBody(request: IncomingMessage): Promise<Body> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const piece = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), "utf8");
    bytes += piece.length;
    if (bytes > MAX_MCP_BODY_BYTES) return { ok: false };
    chunks.push(piece);
  }
  return { ok: true, text: Buffer.concat(chunks).toString("utf8") };
}

function parseMessage(text: string): { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly issue: string } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    if (error instanceof SyntaxError) return { ok: false, issue: error.message };
    throw error;
  }
}

async function answerAll(value: unknown, run: ToolRunner): Promise<object | null> {
  if (!Array.isArray(value)) return answerMcp(value, run);
  const answers = (await Promise.all(value.map((message) => answerMcp(message, run)))).filter((answer): answer is object => answer !== null);
  return answers.length === 0 ? null : answers;
}

export async function serveMcp(request: IncomingMessage, response: ServerResponse, registry: TeamToolRegistry): Promise<void> {
  const token = (request.url ?? "").slice(MCP_PATH_PREFIX.length).split(/[/?#]/)[0] ?? "";
  const run = registry.runnerFor(token);
  if (!run) return void response.writeHead(HTTP_STATUS.notFound).end();
  if (request.method !== "POST") return void response.writeHead(HTTP_STATUS.methodNotAllowed, { allow: "POST" }).end();
  const body = await readBody(request);
  if (!body.ok) return void response.writeHead(HTTP_STATUS.tooLarge).end();
  const message = parseMessage(body.text);
  const answer = message.ok ? await answerAll(message.value, run) : rpcError(null, JSON_RPC_ERRORS.parse, `Invalid JSON: ${message.issue}`);
  if (answer === null) return void response.writeHead(HTTP_STATUS.accepted).end();
  response.writeHead(HTTP_STATUS.ok, { "content-type": "application/json" }).end(JSON.stringify(answer));
}
