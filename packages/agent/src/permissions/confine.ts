import type {
  RequestPermissionRequest,
  TaskContract,
  ToolKind,
} from "@weave/protocol";
import { firstMatch } from "./globs.ts";
import { isInside, isScratchPath, isSharedReadPath, relativeInside } from "./path-confinement.ts";
import { extractCommand, extractWorkingDir, inspectCommandBoundaries } from "./command-safety.ts";
import { classifyCommand } from "./read-only-commands.ts";
import {
  changesAnythingInPlanMode,
  findAllowOption,
  findRejectOption,
  isAlwaysApproveMode,
  isPlanModeExit,
  PLAN_MODE_ID,
} from "./options.ts";
import type {
  PermissionDecision,
  PermissionPolicy,
  PermissionPrompter,
} from "./types.ts";

const READ_ONLY_KINDS = new Set<ToolKind>([
  "read",
  "search",
  "think",
  "fetch",
  "switch_mode",
]);

function mutates(kind: ToolKind | null | undefined): boolean {
  return kind == null || !READ_ONLY_KINDS.has(kind);
}

function mayReadSharedPaths(kind: ToolKind | null | undefined, rawInput: unknown): boolean {
  if (!mutates(kind)) return true;
  if (kind !== "execute" && kind != null) return false;
  const command = extractCommand(rawInput);
  return command !== null && classifyCommand(command).kind === "read-only";
}

function isKeptLocation(cwd: string, path: string, mayReadShared: boolean): boolean {
  if (isInside(cwd, path) || isScratchPath(path)) return true;
  return mayReadShared && isSharedReadPath(path);
}

function checkPathBoundaries(
  task: TaskContract,
  request: RequestPermissionRequest,
  reject?: string,
): PermissionDecision | null {
  const locations = request.toolCall.locations ?? [];
  const mayReadShared = mayReadSharedPaths(request.toolCall.kind, request.toolCall.rawInput);
  const outside = locations.find((loc) => !isKeptLocation(task.cwd, loc.path, mayReadShared));
  if (outside) {
    return {
      decision: "reject",
      optionId: reject,
      reason: `touches ${outside.path}, outside ${task.cwd}`,
    };
  }
  return null;
}

function checkReadOnlyViolations(
  task: TaskContract,
  locations: readonly { path: string }[],
  kind: ToolKind | null | undefined,
  reject?: string,
): PermissionDecision | null {
  if (!task.readOnlyPaths?.length || !mutates(kind)) return null;

  for (const location of locations) {
    const rel = relativeInside(task.cwd, location.path);
    if (rel === null) continue;
    const pattern = firstMatch(task.readOnlyPaths, rel);
    if (pattern) {
      return {
        decision: "reject",
        optionId: reject,
        reason: `${rel} is read-only (matches "${pattern}")`,
      };
    }
  }
  return null;
}

function checkAllowedPathViolations(
  task: TaskContract,
  locations: readonly { path: string }[],
  kind: ToolKind | null | undefined,
  reject?: string,
): PermissionDecision | null {
  if (!task.allowedPaths?.length || !mutates(kind)) return null;

  for (const location of locations) {
    const rel = relativeInside(task.cwd, location.path);
    if (rel === null) continue;
    if (!firstMatch(task.allowedPaths, rel)) {
      return {
        decision: "reject",
        optionId: reject,
        reason: `${rel} is not in allowedPaths`,
      };
    }
  }
  return null;
}

function checkCommandSafety(
  task: TaskContract,
  rawInput: unknown,
  reject?: string,
): { decision: PermissionDecision | null; command: string | null } {
  const command = extractCommand(rawInput);
  if (!command) return { decision: null, command: null };

  const safety = inspectCommandBoundaries(command, task.cwd, extractWorkingDir(rawInput));
  if (!safety.allowed) {
    return {
      decision: {
        decision: "reject",
        optionId: reject,
        reason: `command rejected: ${safety.reason}`,
      },
      command,
    };
  }
  return { decision: null, command };
}

export const confineToTaskDir: PermissionPolicy = (task, request) => {
  if (isPlanModeExit(request)) {
    return {
      decision: "reject",
      reason:
        "plan held for user review in Weave — wait for the approved plan before executing",
    };
  }

  const reject = findRejectOption(request) ?? undefined;
  const allow = findAllowOption(request);
  if (!allow) {
    return {
      decision: "reject",
      optionId: reject,
      reason: "agent offered no allow option",
    };
  }

  const locations = request.toolCall.locations ?? [];
  const boundaryError = checkPathBoundaries(task, request, reject);
  if (boundaryError) return boundaryError;

  const readOnlyError = checkReadOnlyViolations(task, locations, request.toolCall.kind, reject);
  if (readOnlyError) return readOnlyError;

  const allowedPathError = checkAllowedPathViolations(task, locations, request.toolCall.kind, reject);
  if (allowedPathError) return allowedPathError;

  const { decision: commandError, command } = checkCommandSafety(task, request.toolCall.rawInput, reject);
  if (commandError) return commandError;

  const reason = locations.length > 0
    ? `${allow.kind}; ${locations.length} location(s) within task cwd`
    : command
      ? `${allow.kind}; command verified within task cwd`
      : `${allow.kind}; no locations reported (unverified)`;

  return { decision: "allow", optionId: allow.optionId, reason };
};

const PLAN_MODE_REASON =
  "plan mode: Weave is holding every change until the user approves a plan — " +
  "keep reading and present the plan instead of editing";

export interface GuardedPolicyOptions {
  /**
   * The agent's mode, read at decision time rather than captured once. The
   * user can switch mid-turn, and an engine that passes its mode as a spawn
   * flag will not apply the change to the turn already running.
   */
  readonly currentModeId?: () => string | null;
}

export function createGuardedPermissionPolicy(
  prompter?: PermissionPrompter,
  { currentModeId }: GuardedPolicyOptions = {},
): PermissionPolicy {
  return async (task, request) => {
    const autoDecision = await confineToTaskDir(task, request);
    // Marked as ours so the client can tell the user: a refusal they never saw
    // a card for otherwise reads as the agent hanging.
    if (autoDecision.decision === "reject") return { ...autoDecision, source: "policy" };

    const command = extractCommand(request.toolCall.rawInput);
    const classified = command === null ? null : classifyCommand(command);
    const commandIsReadOnly = classified?.kind === "read-only";

    if (
      currentModeId?.() === PLAN_MODE_ID &&
      changesAnythingInPlanMode(request, { commandIsReadOnly })
    ) {
      return {
        decision: "reject",
        optionId: findRejectOption(request) ?? undefined,
        reason: PLAN_MODE_REASON,
        source: "policy",
      };
    }

    if (isAlwaysApproveMode(currentModeId?.() ?? null)) return autoDecision;

    const isExecute = request.toolCall.kind === "execute" || command !== null;
    if (!isExecute || !prompter) return autoDecision;

    if (classified?.kind === "read-only") {
      return {
        ...autoDecision,
        reason: `read-only ${classified.binary}; ${autoDecision.reason}`,
      };
    }

    return await prompter(task, request, command);
  };
}

export const rejectAll: PermissionPolicy = (_task, request) => ({
  decision: "reject",
  optionId: request ? (findRejectOption(request) ?? undefined) : undefined,
  reason: "policy: rejectAll",
});

export const replyWithoutTools: PermissionPolicy = (_task, request) => ({
  decision: "reject",
  optionId: request ? (findRejectOption(request) ?? undefined) : undefined,
  reason: "Reply with one JSON object. Do not call tools, read files, or run commands.",
  source: "policy",
});
