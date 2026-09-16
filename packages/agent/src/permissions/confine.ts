import type {
  RequestPermissionRequest,
  TaskContract,
  ToolKind,
} from "@weave/protocol";
import { firstMatch } from "./globs.ts";
import { isInside, relativeInside } from "./path-confinement.ts";
import { extractCommand, inspectCommandBoundaries } from "./command-safety.ts";
import {
  findAllowOption,
  findRejectOption,
  isPlanModeExit,
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

function checkPathBoundaries(
  task: TaskContract,
  locations: readonly { path: string }[],
  reject?: string,
): PermissionDecision | null {
  const outside = locations.find((loc) => !isInside(task.cwd, loc.path));
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

  const safety = inspectCommandBoundaries(command, task.cwd);
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
  const boundaryError = checkPathBoundaries(task, locations, reject);
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

export function createGuardedPermissionPolicy(
  prompter?: PermissionPrompter,
): PermissionPolicy {
  return async (task, request) => {
    const autoDecision = await confineToTaskDir(task, request);
    if (autoDecision.decision === "reject") return autoDecision;

    const command = extractCommand(request.toolCall.rawInput);
    const isExecute = request.toolCall.kind === "execute" || command !== null;
    if (isExecute && prompter) {
      return await prompter(task, request, command);
    }
    return autoDecision;
  };
}

export const rejectAll: PermissionPolicy = () => ({
  decision: "reject",
  reason: "policy: rejectAll",
});
