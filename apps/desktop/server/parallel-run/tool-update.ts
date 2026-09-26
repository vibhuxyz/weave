import { RUN_TOOL_KINDS, RUN_TOOL_STATUSES, type RunToolCall, type RunToolKind, type RunToolPatch, type RunToolStatus } from "../shared/index.ts";
import { MAX_COMMAND_CHARS, MAX_TOOL_ID_CHARS, MAX_TOOL_TITLE_CHARS } from "./constants.ts";

type UpdateRecord = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is UpdateRecord {
  return typeof value === "object" && value !== null;
}

function flattened(text: string, maxChars: number): string {
  return text.replace(/\s+/g, " ").trim().slice(0, maxChars);
}

function idOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim().slice(0, MAX_TOOL_ID_CHARS);
  return id.length > 0 ? id : null;
}

function titleOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const title = flattened(value, MAX_TOOL_TITLE_CHARS);
  return title.length > 0 ? title : null;
}

function kindOf(value: unknown): RunToolKind | null {
  return RUN_TOOL_KINDS.find((kind) => kind === value) ?? null;
}

function statusOf(value: unknown): RunToolStatus | null {
  return RUN_TOOL_STATUSES.find((status) => status === value) ?? null;
}

function commandOf(rawInput: unknown): string | null {
  if (!isRecord(rawInput)) return null;
  const command = rawInput.command;
  if (typeof command !== "string") return null;
  const capped = command.trim().slice(0, MAX_COMMAND_CHARS);
  return capped.length > 0 ? capped : null;
}

export function toolCallOf(update: UpdateRecord): RunToolCall | null {
  const id = idOf(update.toolCallId);
  const title = titleOf(update.title);
  if (id === null || title === null) return null;
  const command = commandOf(update.rawInput);
  return {
    id,
    title,
    toolKind: kindOf(update.kind) ?? "other",
    status: statusOf(update.status) ?? "pending",
    ...(command === null ? {} : { command }),
  };
}

export function toolPatchOf(update: UpdateRecord): RunToolPatch | null {
  const id = idOf(update.toolCallId);
  if (id === null) return null;
  const title = titleOf(update.title);
  const toolKind = kindOf(update.kind);
  const status = statusOf(update.status);
  return {
    id,
    ...(title === null ? {} : { title }),
    ...(toolKind === null ? {} : { toolKind }),
    ...(status === null ? {} : { status }),
  };
}
