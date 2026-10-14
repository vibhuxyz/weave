import { isAbsolute, relative } from "node:path";
import { flatten, isRecord } from "@weave/core";
import type { WeaveEvent } from "@weave/protocol";
import {
  COMMAND_KIND,
  FILE_CHANGING_KINDS,
  MAX_CAPTURED_ANSWER_CHARS,
  MAX_FACT_CHARS,
  MAX_TRACKED_FILES,
  MAX_TRACKED_TOOLS,
  MAX_TURN_COMMANDS,
  MAX_TURN_FAILURES,
  MAX_TURN_FILES,
} from "./constants.ts";
import type { CapturedTurn } from "./types.ts";

type TurnSignal =
  | { readonly kind: "file"; readonly path: string }
  | { readonly kind: "text"; readonly text: string }
  | {
      readonly kind: "tool";
      readonly id: string;
      readonly isStart: boolean;
      readonly title: string | null;
      readonly toolKind: string | null;
      readonly status: string | null;
      readonly paths: readonly string[];
    };

interface ToolSeen {
  readonly title: string;
  readonly toolKind: string | null;
  readonly paths: readonly string[];
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function locationPaths(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: unknown) => (isRecord(entry) && typeof entry.path === "string" ? [entry.path] : []));
}

function toolSignal(update: Readonly<Record<string, unknown>>): TurnSignal | null {
  const id = textOrNull(update.toolCallId);
  if (id === null) return null;
  return {
    kind: "tool",
    id,
    isStart: update.sessionUpdate === "tool_call",
    title: textOrNull(update.title),
    toolKind: textOrNull(update.kind),
    status: textOrNull(update.status),
    paths: locationPaths(update.locations),
  };
}

function turnSignal(event: WeaveEvent, taskId: string): TurnSignal | null {
  if (event.taskId !== taskId) return null;
  if (event.type === "file.written") return { kind: "file", path: event.path };
  if (event.type !== "agent.message" || !isRecord(event.update)) return null;
  const update = event.update;
  if (update.sessionUpdate === "tool_call" || update.sessionUpdate === "tool_call_update") return toolSignal(update);
  if (update.sessionUpdate !== "agent_message_chunk" || !isRecord(update.content)) return null;
  const text = update.content.type === "text" ? textOrNull(update.content.text) : null;
  return text === null ? null : { kind: "text", text };
}

function clipFact(text: string): string {
  const characters = [...flatten(text)];
  return characters.length <= MAX_FACT_CHARS ? characters.join("") : `${characters.slice(0, MAX_FACT_CHARS - 1).join("")}…`;
}

function displayPath(projectDir: string, path: string): string {
  if (!isAbsolute(path)) return clipFact(path);
  const inside = relative(projectDir, path);
  const isOutside = inside.startsWith("..") || isAbsolute(inside);
  return clipFact(isOutside ? path : inside);
}

function mergedTool(previous: ToolSeen | undefined, signal: Extract<TurnSignal, { kind: "tool" }>): ToolSeen {
  return {
    title: signal.title ?? previous?.title ?? "tool call",
    toolKind: signal.toolKind ?? previous?.toolKind ?? null,
    paths: signal.paths.length > 0 ? signal.paths : previous?.paths ?? [],
  };
}

export class TurnCapture {
  private readonly taskId: string;
  private readonly projectDir: string;
  private readonly files = new Set<string>();
  private readonly commands: string[] = [];
  private readonly failures: string[] = [];
  private readonly tools = new Map<string, ToolSeen>();
  private readonly settled = new Set<string>();
  private answerParts: string[] = [];
  private answerChars = 0;

  constructor(taskId: string, projectDir: string) {
    this.taskId = taskId;
    this.projectDir = projectDir;
  }

  readonly apply = (event: WeaveEvent): void => {
    const signal = turnSignal(event, this.taskId);
    if (signal === null) return;
    if (signal.kind === "file") this.addFile(signal.path);
    else if (signal.kind === "tool") this.applyTool(signal);
    else this.addAnswerText(signal.text);
  };

  snapshot(): CapturedTurn {
    const sortedFiles = [...this.files].sort();
    return {
      answerText: this.answerParts.join("").trim(),
      facts: {
        files: sortedFiles.slice(0, MAX_TURN_FILES),
        fileCount: sortedFiles.length,
        commands: [...this.commands],
        failures: [...this.failures],
      },
    };
  }

  private addFile(path: string): void {
    if (this.files.size < MAX_TRACKED_FILES) this.files.add(displayPath(this.projectDir, path));
  }

  private addAnswerText(text: string): void {
    if (this.answerChars >= MAX_CAPTURED_ANSWER_CHARS) return;
    this.answerParts.push(text);
    this.answerChars += text.length;
  }

  private applyTool(signal: Extract<TurnSignal, { kind: "tool" }>): void {
    if (signal.isStart) {
      this.answerParts = [];
      this.answerChars = 0;
    }
    const previous = this.tools.get(signal.id);
    if (previous === undefined && this.tools.size >= MAX_TRACKED_TOOLS) return;
    const tool = mergedTool(previous, signal);
    this.tools.set(signal.id, tool);
    const isNewCommand = previous?.toolKind !== COMMAND_KIND && tool.toolKind === COMMAND_KIND;
    if (isNewCommand && this.commands.length < MAX_TURN_COMMANDS) this.commands.push(clipFact(tool.title));
    this.settle(signal.id, tool, signal.status);
  }

  private settle(id: string, tool: ToolSeen, status: string | null): void {
    if (this.settled.has(id) || (status !== "completed" && status !== "failed")) return;
    this.settled.add(id);
    if (status === "failed") {
      if (this.failures.length < MAX_TURN_FAILURES) this.failures.push(clipFact(tool.title));
      return;
    }
    if (tool.toolKind !== null && FILE_CHANGING_KINDS.has(tool.toolKind)) {
      for (const path of tool.paths) this.addFile(path);
    }
  }
}
