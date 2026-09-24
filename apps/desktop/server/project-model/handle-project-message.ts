import { errorMessage, type ProjectClientMessage, type ServerMessage } from "../shared/index.ts";
import { MAX_QUERY_CHARS } from "./constants.ts";
import type { ProjectModelCache } from "./model-cache.ts";
import { projectOverview } from "./overview.ts";
import { queryView } from "./query-view.ts";

export interface ProjectMessageContext {
  readonly models: ProjectModelCache;
  readonly send: (msg: ServerMessage) => void;
}

function queryProblem(queryId: unknown, text: unknown): string | null {
  if (typeof queryId !== "string" || queryId.length === 0) return "Cannot search the project: the request has no queryId.";
  if (typeof text !== "string" || text.trim() === "") return "Type what you want to find or change.";
  if (text.length > MAX_QUERY_CHARS) return `Keep the search under ${MAX_QUERY_CHARS} characters.`;
  return null;
}

async function sendOverview(ctx: ProjectMessageContext): Promise<void> {
  const read = await ctx.models.read();
  ctx.send(read.ok ? { type: "project-overview", overview: projectOverview(read.model) } : { type: "project-overview-failed", message: read.message });
}

async function sendQuery(queryId: string, text: string, ctx: ProjectMessageContext): Promise<void> {
  const problem = queryProblem(queryId, text);
  if (problem) {
    ctx.send({ type: "project-query-failed", queryId, message: problem });
    return;
  }
  const read = await ctx.models.read();
  ctx.send(read.ok ? { type: "project-query-result", queryId, result: queryView(read.model, text.trim()) } : { type: "project-query-failed", queryId, message: read.message });
}

export async function handleProjectMessage(msg: ProjectClientMessage, ctx: ProjectMessageContext): Promise<void> {
  try {
    if (msg.type === "read-project-overview") await sendOverview(ctx);
    else await sendQuery(msg.queryId, msg.text, ctx);
  } catch (error) {
    const message = `Project intelligence failed: ${errorMessage(error)}`;
    ctx.send(msg.type === "query-project" ? { type: "project-query-failed", queryId: String(msg.queryId), message } : { type: "project-overview-failed", message });
  }
}
