import type { ToolEntry } from "@/features/chat/hooks";
import { MAX_COMMAND_LABEL_CHARS } from "./constants";

type Action = "ran" | "read" | "edited" | "created" | "deleted" | "searched" | "fetched" | "used" | "added-task" | "started-task" | "completed-task";

const VERB = {
  ran: "ran",
  read: "read",
  edited: "edited",
  created: "created",
  deleted: "deleted",
  searched: "searched",
  fetched: "fetched",
  used: "used",
  "added-task": "added",
  "started-task": "started",
  "completed-task": "completed",
} as const satisfies Record<Action, string>;

const TASK_NOUN = ["a task", "tasks"] as const;
const MAX_TASK_LABEL_CHARS = 120;

const COUNT_NOUN = {
  ran: ["a command", "commands"],
  read: ["a file", "files"],
  edited: ["a file", "files"],
  created: ["a file", "files"],
  deleted: ["a file", "files"],
  searched: ["once", "times"],
  fetched: ["a page", "pages"],
  used: ["a tool", "tools"],
  "added-task": TASK_NOUN,
  "started-task": TASK_NOUN,
  "completed-task": TASK_NOUN,
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
  "added-task": "Adding task",
  "started-task": "Starting task",
  "completed-task": "Completing task",
} as const satisfies Record<Action, string>;

const NAMED_ACTIONS: ReadonlySet<Action> = new Set(["read", "edited", "created", "deleted"]);

function isCreation(tool: ToolEntry): boolean {
  return (tool.diffs?.length ?? 0) > 0 && (tool.diffs ?? []).every((diff) => diff.oldText === null);
}

export function actionOf(tool: ToolEntry): Action {
  if (tool.planChange) return `${tool.planChange}-task`;
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
  if (tool.planChange) return tool.title.length <= MAX_TASK_LABEL_CHARS ? tool.title : `${tool.title.slice(0, MAX_TASK_LABEL_CHARS)}…`;
  const action = actionOf(tool);
  if (action === "ran") return clipped(firstLine(commandOf(tool)));
  if (NAMED_ACTIONS.has(action)) return fileNameOf(tool);
  return clipped(firstLine(tool.title));
}

export function rowVerb(tool: ToolEntry, isRunning: boolean): string {
  const action = actionOf(tool);
  if (isRunning) return RUNNING_VERB[action];
  const verb = VERB[action];
  const text = tool.planChange ? `${verb} task` : verb;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const MAX_SPOKEN_NAMES = 4;
const GENERIC_PARENTS: ReadonlySet<string> = new Set(["src", "lib", "dist", "app", "apps", "packages", "components", "core", "test", "tests", "__tests__"]);
const INDEX_STEMS: ReadonlySet<string> = new Set(["index", "package", "mod", "main"]);
const FILE_ACTIONS: ReadonlySet<Action> = new Set(["read", "edited", "created", "deleted"]);

function phrase(action: Action, tools: readonly ToolEntry[]): string {
  const [one, many] = COUNT_NOUN[action];
  const first = tools[0];
  const verb = VERB[action];
  if (tools.length === 1 && first && NAMED_ACTIONS.has(action)) return `${verb} ${fileNameOf(first)}`;
  return tools.length === 1 ? `${verb} ${one}` : `${verb} ${tools.length} ${many}`;
}

function failedSuffix(tools: readonly ToolEntry[]): string {
  const failedCount = tools.filter((tool) => tool.status === "failed").length;
  return failedCount === 0 ? "" : ` (${failedCount} failed)`;
}

function pathParts(tool: ToolEntry): readonly string[] {
  const path = tool.diffs?.[0]?.path ?? tool.title.replace(/^(?:Read|Edit|Write|Delete|Created)\s+/i, "");
  return path.split(/[\\/]/).filter(Boolean);
}

function wordsOf(text: string): string {
  return text.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

function spokenName(tool: ToolEntry, withParent: boolean): string {
  const parts = pathParts(tool);
  const file = parts.at(-1) ?? tool.title;
  const stem = file.replace(/\.[^.]+$/, "") || file;
  const parent = parts.at(-2);
  if (parent && (INDEX_STEMS.has(stem) || (withParent && !GENERIC_PARENTS.has(parent)))) return wordsOf(`${parent} ${stem}`);
  return wordsOf(stem);
}

function joinLimited(names: readonly string[], style: "comma" | "and"): string {
  const shown = names.slice(0, MAX_SPOKEN_NAMES);
  const hidden = names.length - shown.length;
  const last = shown.at(-1) ?? "";
  const listed =
    style === "and" && shown.length === 2
      ? `${shown[0] ?? ""} and ${last}`
      : style === "and" && shown.length > 2
        ? `${shown.slice(0, -1).join(", ")}, and ${last}`
        : shown.join(", ");
  return hidden > 0 ? `${listed} +${hidden}` : listed;
}

function fileBody(action: Action, tools: readonly ToolEntry[]): string {
  if (action === "read") return `read ${joinLimited(tools.map((tool) => spokenName(tool, false)), "comma")}`;
  if (action === "edited") return `wrote ${joinLimited(tools.map((tool) => spokenName(tool, true)), "and")}`;
  if (action === "created") return `created ${joinLimited(tools.map((tool) => fileNameOf(tool)), "comma")}`;
  const only = tools[0];
  return tools.length === 1 && only ? `deleted ${fileNameOf(only)}` : `deleted ${tools.length} files`;
}

function grouped(tools: readonly ToolEntry[]): Map<Action, ToolEntry[]> {
  const map = new Map<Action, ToolEntry[]>();
  for (const tool of tools) {
    const action = actionOf(tool);
    const list = map.get(action);
    if (list) list.push(tool);
    else map.set(action, [tool]);
  }
  return map;
}

function typecheckTarget(command: string): string | null {
  const raw = command.match(/--filter(?:=|\s+)(\S+)/)?.[1] ?? command.match(/(?:--project|-p)(?:=|\s+)(\S+)/)?.[1];
  if (!raw || raw.includes("*")) return null;
  return raw.replace(/^['"]|['"]$/g, "").split(/[\\/]/).filter(Boolean).at(-1)?.replace(/\.(?:json|ts)$/i, "") ?? null;
}

function commandBody(tools: readonly ToolEntry[], alone: boolean): string {
  const commands = tools.map((tool) => firstLine(commandOf(tool)));
  const typed = alone && commands.every((command) => /\b(?:typecheck|type-check|tsc)\b/i.test(command));
  if (!typed) return `ran ${tools.length === 1 ? "a command" : `${tools.length} commands`}${failedSuffix(tools)}`;
  const targets = commands.map(typecheckTarget);
  const first = targets[0];
  const named = first && targets.every((target) => target === first) ? clipped(first) : null;
  return `${named ? `typechecked ${named}` : "typechecked all workspaces"}${failedSuffix(tools)}`;
}

export function groupLabel(tools: readonly ToolEntry[]): string {
  const groups = grouped(tools);
  const parts: string[] = [];
  for (const action of ["read", "edited", "created", "deleted"] as const) {
    const group = groups.get(action);
    if (group && group.length > 0) parts.push(`${fileBody(action, group)}${failedSuffix(group)}`);
  }
  const commands = groups.get("ran");
  if (commands && commands.length > 0) parts.push(commandBody(commands, groups.size === 1));
  for (const [action, group] of groups) {
    if (action === "ran" || FILE_ACTIONS.has(action)) continue;
    parts.push(`${phrase(action, group)}${failedSuffix(group)}`);
  }
  const text = parts.join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function runningLabel(tool: ToolEntry): string {
  const subject = rowSubject(tool);
  return `${rowVerb(tool, true)} ${subject}${subject.endsWith("…") ? "" : "…"}`;
}


