import type { SessionUpdate } from "@weave/protocol";
import type { ServerMessage } from "../../server/shared/index.ts";

export interface RecordedEvent {
  readonly atMs: number;
  readonly source: "engine" | "server" | "client";
  readonly label: string;
}

function describeUpdate(update: SessionUpdate): string {
  switch (update.sessionUpdate) {
    case "usage_update":
      return `usage ${update.used}/${update.size}`;
    case "agent_message_chunk":
      return update.content.type === "text" ? `text ${JSON.stringify(update.content.text.slice(0, 80))}` : "chunk";
    case "tool_call":
    case "tool_call_update":
      return `${update.sessionUpdate} ${update.status ?? ""} ${update._meta ? JSON.stringify(update._meta) : ""}`.trim();
    default:
      return update.sessionUpdate;
  }
}

function describeServer(msg: ServerMessage): string {
  if (msg.type !== "compaction") return msg.type;
  const detail = msg.status === "failed" ? ` ${msg.reason}` : "";
  return `compaction ${msg.status} ${msg.trigger}${detail}`;
}

export class Recorder {
  readonly events: RecordedEvent[] = [];
  private readonly startedAt = Date.now();

  engine(update: SessionUpdate): void {
    this.push("engine", describeUpdate(update));
  }

  server(msg: ServerMessage): void {
    this.push("server", describeServer(msg));
  }

  client(label: string): void {
    this.push("client", label);
  }

  labels(): string[] {
    return this.events.map((event) => `${event.source}: ${event.label}`);
  }

  private push(source: RecordedEvent["source"], label: string): void {
    const event = { atMs: Date.now() - this.startedAt, source, label };
    this.events.push(event);
    console.log(`${String(event.atMs).padStart(7)}ms ${source.padEnd(6)} ${label}`);
  }
}

export function indexOfLabel(labels: readonly string[], prefix: string, from = 0): number {
  return labels.findIndex((label, index) => index >= from && label.startsWith(prefix));
}
