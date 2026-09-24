import type { ToolEntry } from "@/features/chat/hooks";
import { MAX_COMMAND_LABEL_CHARS } from "./constants";

type Action = "ran" | "read" | "edited" | "created" | "deleted" | "searched" | "fetched" | "used";

const COUNT_NOUN = {
  ran: ["a command", "commands"],
  read: ["a file", "files"],
  edited: ["a file", "files"],
  created: ["a file", "files"],
  deleted: ["a file", "files"],
  searched: ["once", "times"],
  fetched: ["a page", "pages"],
  used: ["a tool", "tools"],
} as const satisfies Record<Action, readonly [string, string]>;

const RUNNING_VERB = {
  ran: "Running",
  read: "Reading",
  edited: "Editing",
  created: "Creating",
  deleted: "Deleting",
  searched: "Searching",
  fetched: "Fetching",
  used: "Using",
} as const satisfies Record<Action, string>;

const NAMED_ACTIONS: ReadonlySet<Action> = new Set(["read", "edited", "created", "deleted"]);

function isCreation(tool: ToolEntry): boolean {
  return (tool.diffs?.length ?? 0) > 0 && (tool.diffs ?? []).every((diff) => diff.oldText === null);
}

export function actionOf(tool: ToolEntry): Action {
  switch (tool.kind) {
    case "execute":
      return "ran";
    case "read":
      return "read";
    case "edit":
      return isCreation(tool) ? "created" : "edited";
    case "delete":
      return "deleted";
    case "search":
      return "searched";
    case "fetch":
      return "fetched";
    default:
      return "used";
  }
}

function firstLine(text: string): string {
  return text.split(/\r?\n/, 1)[0]?.trim() ?? "";
}

export function commandOf(tool: ToolEntry): string {
  const input = tool.rawInput;
  if (typeof input === "object" && input !== null && "command" in input && typeof input.command === "string") return input.command;
  return tool.title;
}

export function fileNameOf(tool: ToolEntry): string {
  const path = tool.diffs?.[0]?.path ?? tool.title.replace(/^(Read|Edit|Write|Delete)\s+/i, "");
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

function clipped(text: string): string {
  return text.length <= MAX_COMMAND_LABEL_CHARS ? text : `${text.slice(0, MAX_COMMAND_LABEL_CHARS)}…`;
}

export function rowSubject(tool: ToolEntry): string {
  const action = actionOf(tool);
  if (action === "ran") return clipped(firstLine(commandOf(tool)));
  if (NAMED_ACTIONS.has(action)) return fileNameOf(tool);
  return clipped(firstLine(tool.title));
}

export function rowVerb(tool: ToolEntry, isRunning: boolean): string {
  const action = actionOf(tool);
  if (isRunning) return RUNNING_VERB[action];
  return action.charAt(0).toUpperCase() + action.slice(1);
}

function phrase(action: Action, tools: readonly ToolEntry[]): string {
  const [one, many] = COUNT_NOUN[action];
  const first = tools[0];
  if (tools.length === 1 && first && NAMED_ACTIONS.has(action)) return `${action} ${fileNameOf(first)}`;
  return tools.length === 1 ? `${action} ${one}` : `${action} ${tools.length} ${many}`;
}

export function groupLabel(tools: readonly ToolEntry[]): string {
  const byAction = new Map<Action, ToolEntry[]>();
  for (const tool of tools) {
    const action = actionOf(tool);
    byAction.set(action, [...(byAction.get(action) ?? []), tool]);
  }
  const text = [...byAction].map(([action, group]) => phrase(action, group)).join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
