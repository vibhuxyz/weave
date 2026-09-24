import type { WeaveEvent } from "@weave/protocol";
import type { RunUpdate } from "../shared/index.ts";
import { MAX_DETAIL_CHARS, MAX_TEXT_CHUNK_CHARS, MAX_TOOL_TITLE_CHARS } from "./constants.ts";
import { workforceUpdate } from "./workforce-update.ts";

type AgentMessageEvent = Extract<WeaveEvent, { type: "agent.message" }>;

function capped(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : text.slice(0, maxChars);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function chunkText(update: Readonly<Record<string, unknown>>): string | null {
  const content = update.content;
  if (!isRecord(content) || content.type !== "text" || typeof content.text !== "string") return null;
  return content.text;
}

function projectAgentMessage(event: AgentMessageEvent, taskId: string): RunUpdate | null {
  const update = event.update;
  if (!isRecord(update)) return null;
  if (update.sessionUpdate === "agent_message_chunk") {
    const text = chunkText(update);
    return text ? { kind: "text", taskId, text: capped(text, MAX_TEXT_CHUNK_CHARS) } : null;
  }
  if (update.sessionUpdate === "tool_call" && typeof update.title === "string") {
    return { kind: "tool", taskId, title: capped(update.title.replace(/\s+/g, " ").trim(), MAX_TOOL_TITLE_CHARS) };
  }
  return null;
}

function projectTaskEvent(event: WeaveEvent, taskId: string): RunUpdate | null {
  switch (event.type) {
    case "task.started":
      return { kind: "task-started", taskId };
    case "agent.message":
      return projectAgentMessage(event, taskId);
    case "file.written":
      return { kind: "file", taskId, path: event.path };
    case "usage":
      return event.costUsd === undefined ? null : { kind: "cost", taskId, costUsd: event.costUsd };
    case "pool.task.settled":
      return { kind: "task-settled", taskId, status: event.status, reason: event.reason && capped(event.reason, MAX_DETAIL_CHARS) };
    case "merge.finished":
      return { kind: "merge", taskId, status: event.status, detail: capped(event.detail, MAX_DETAIL_CHARS) };
    default:
      return null;
  }
}

export function projectRunEvent(event: WeaveEvent): RunUpdate | null {
  switch (event.type) {
    case "plan.created":
      return {
        kind: "plan",
        mode: event.mode,
        reason: event.reason,
        tasks: event.tasks.map((task) => ({ id: task.id, title: task.title, dependsOn: task.dependsOn })),
      };
    case "contract.changed":
      return { kind: "contract-changed", version: event.version, requestedBy: event.requestedBy, rerun: event.rerun };
    case "integration.finished":
      return { kind: "integration", status: event.status, branch: event.branch, brokenBy: event.brokenBy };
    default:
      return workforceUpdate(event) ?? (event.taskId === undefined ? null : projectTaskEvent(event, event.taskId));
  }
}
