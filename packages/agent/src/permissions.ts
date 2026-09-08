import { realpathSync } from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";
import type {
  RequestPermissionRequest,
  RequestPermissionResponse,
  ToolKind,
} from "@weave/protocol";
import type { TaskContract } from "@weave/protocol";
import { firstMatch } from "./globs.ts";

export type PermissionDecision =
  | { decision: "allow"; optionId: string; reason: string }
  | { decision: "reject"; reason: string };

/**
 * Decides whether the agent may perform a tool call.
 *
 * This is on the critical path, not cleanup. With one agent and a human
 * watching, auto-approve is survivable. With N agents running unattended it is
 * the only thing between a plan and `rm -rf`, and nobody is at the window.
 */
export type PermissionPolicy = (
  task: TaskContract,
  request: RequestPermissionRequest,
) => PermissionDecision | Promise<PermissionDecision>;

/** Pick an option the agent itself labelled as an allow. */
function findAllowOption(
  request: RequestPermissionRequest,
): { optionId: string; kind: string } | null {
  // Never index into options[0]: the order is the agent's choice, and the
  // kinds are allow_once | allow_always | reject_once | reject_always. Match a
  // reject and the agent asks forever while writing nothing.
  const option =
    request.options.find((entry) => entry.kind === "allow_always") ??
    request.options.find((entry) => entry.kind === "allow_once");
  return option ? { optionId: option.optionId, kind: option.kind } : null;
}

/**
 * Resolve symlinks as far as the path actually exists.
 *
 * Required, not defensive. On macOS `/var` is a symlink to `/private/var`:
 * `mkdtemp` hands back `/var/folders/…` while the agent reports the realpath
 * `/private/var/folders/…`. Comparing those lexically rejects every write
 * inside the task's own directory — which looked exactly like a weak model
 * until the ledger showed the reason.
 *
 * A file about to be created does not exist yet, so walk up to the nearest
 * ancestor that does and re-attach the remainder.
 */
function realish(path: string): string {
  let current = resolve(path);
  const trailing: string[] = [];
  for (;;) {
    try {
      return resolve(realpathSync(current), ...trailing.reverse());
    } catch {
      const parent = dirname(current);
      if (parent === current) return resolve(path);
      trailing.push(basename(current));
      current = parent;
    }
  }
}

/** Is `candidate` inside `root`? Used for both reads and writes. */
export function isInside(root: string, candidate: string): boolean {
  const rel = relative(realish(root), realish(candidate));
  return rel === "" || (rel !== ".." && !rel.startsWith("../"));
}

/**
 * `candidate` as a POSIX path relative to `root`, or null when it is outside.
 *
 * Symlinks are resolved on both sides first — the same `/var` vs `/private/var`
 * trap that `realish` exists for. Comparing an unresolved path against a
 * resolved one silently produces `../../..` and every glob then fails to match,
 * which would disable the deny list without any error appearing anywhere.
 */
export function relativeInside(root: string, candidate: string): string | null {
  const rel = relative(realish(root), realish(candidate));
  if (rel !== "" && (rel === ".." || rel.startsWith(".."))) return null;
  return rel.split(sep).join("/");
}

/**
 * Tool kinds that cannot modify anything.
 *
 * Everything NOT in this set is treated as a possible write, `other` included.
 * On a deny list the conservative reading is the correct one: a new ACP tool
 * kind should arrive blocked from the test suite, not silently allowed.
 */
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

/**
 * Claude Code (and other engines') "plan mode" ends with an `ExitPlanMode`
 * tool call that asks permission to start executing. Weave holds that: the
 * plan is surfaced in the approval modal and the user decides. Rejecting here
 * makes the engine stop and wait for the follow-up prompt the modal sends.
 */
export function isPlanModeExit(request: RequestPermissionRequest): boolean {
  const title = (request.toolCall.title ?? "").toLowerCase();
  if (/\bexit\s?plan\s?mode\b|\bapprove plan\b|\bpresent(?:ing)? (?:the )?plan\b/.test(title)) {
    return true;
  }
  const id = (request.toolCall.toolCallId ?? "").toLowerCase();
  if (id.includes("exitplanmode") || id.includes("exit_plan_mode")) return true;
  const raw = request.toolCall.rawInput;
  return (
    typeof raw === "object" &&
    raw !== null &&
    "plan" in (raw as Record<string, unknown>)
  );
}

/**
 * Extract a shell command string from toolCall rawInput if present.
 */
export function extractCommand(rawInput: unknown): string | null {
  if (rawInput == null) return null;
  if (typeof rawInput === "string") return rawInput.trim();
  if (typeof rawInput === "object") {
    const rec = rawInput as Record<string, unknown>;
    const cmd = rec.command ?? rec.cmd ?? rec.script;
    if (typeof cmd === "string") return cmd.trim();
  }
  return null;
}

export interface CommandSafetyResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Inspect a shell command to ensure it stays strictly within `cwd`.
 *
 * Catches:
 * 1. Sensitive home/system directory access (~/.ssh, ~/.aws, ~/.gnupg, ~/.kube, /etc/passwd, etc.)
 * 2. Directory traversal escaping cwd (e.g. `cd ../..`, `cat ../secret`, `rm -rf ../`)
 * 3. Absolute user/system paths outside cwd (e.g. `/Users/...` or `/home/...` not under cwd)
 * 4. Destructive system-wide root or home directory wipes
 */
export function inspectCommandBoundaries(
  command: string,
  cwd: string,
): CommandSafetyResult {
  const normalizedCwd = realish(cwd);

  // 1. Sensitive credential or system directories
  const sensitivePatterns = [
    /(?:^|[\s"'`=])(~|\$HOME)\/(?:\.ssh|\.aws|\.gnupg|\.kube|\.config\/gcloud)/i,
    /(?:^|[\s"'`=])\/(?:Users|home)\/[^/\s"']+\/(?:\.ssh|\.aws|\.gnupg|\.kube)/i,
    /(?:^|[\s"'`=])\/(?:etc|private\/etc)\/(?:passwd|shadow|sudoers)/i,
  ];
  for (const pattern of sensitivePatterns) {
    if (pattern.test(command)) {
      return {
        allowed: false,
        reason: "references sensitive credential or system directory",
      };
    }
  }

  // 2. Destructive root/home patterns
  if (/(?:^|[\s"'`;])rm\s+(?:-[a-zA-Z]*[rf][a-zA-Z]*\s+)+(?:\/|~|\$HOME)(?:$|[\s"'`;])/i.test(command)) {
    return {
      allowed: false,
      reason: "destructive command targeting root or home directory",
    };
  }

  // 3. Path traversal escaping cwd (e.g. `../` or `/..`)
  // Excludes git revision ranges like `HEAD..main`
  if (/(?:^|[\s"'`=])(?:\.\.\/|\/\.\.)/.test(command)) {
    return {
      allowed: false,
      reason: "contains path traversal (..) escaping task directory",
    };
  }

  // 4. Absolute paths referencing /Users/ or /home/ outside cwd
  const userPathMatches = command.match(/(?:\/Users|\/home)\/[^\s"'`;]+/g);
  if (userPathMatches) {
    for (const rawPath of userPathMatches) {
      const cleanPath = rawPath.replace(/[,:;)"']+$/, "");
      if (!isInside(normalizedCwd, cleanPath)) {
        return {
          allowed: false,
          reason: `targets ${cleanPath}, outside task cwd`,
        };
      }
    }
  }

  return { allowed: true };
}

/**
 * The default policy: allow anything the agent asks for **within the task's
 * cwd**, minus anything `readOnlyPaths` forbids. Reject everything else.
 *
 * Enforces boundaries across both file locations and shell command inputs.
 */
export const confineToTaskDir: PermissionPolicy = (task, request) => {
  if (isPlanModeExit(request)) {
    return {
      decision: "reject",
      reason:
        "plan held for user review in Weave — wait for the approved plan before executing",
    };
  }

  const allow = findAllowOption(request);
  if (!allow) {
    return {
      decision: "reject",
      reason: "agent offered no allow option",
    };
  }

  const locations = request.toolCall.locations ?? [];
  const outside = locations.find(
    (location) => !isInside(task.cwd, location.path),
  );
  if (outside) {
    return {
      decision: "reject",
      reason: `touches ${outside.path}, outside ${task.cwd}`,
    };
  }

  // The deny list. Only applied to tool calls that could write: an agent
  // READING the test suite is expected and useful, and blocking that would
  // push it into guessing what the tests assert.
  if (task.readOnlyPaths?.length && mutates(request.toolCall.kind)) {
    for (const location of locations) {
      const rel = relativeInside(task.cwd, location.path);
      if (rel === null) continue;
      const pattern = firstMatch(task.readOnlyPaths, rel);
      if (pattern) {
        return {
          decision: "reject",
          reason: `${rel} is read-only (matches "${pattern}")`,
        };
      }
    }
  }

  // Inspect command payload for execute tools or tool calls reporting a command
  const command = extractCommand(request.toolCall.rawInput);
  if (command) {
    const safety = inspectCommandBoundaries(command, task.cwd);
    if (!safety.allowed) {
      return {
        decision: "reject",
        reason: `command rejected: ${safety.reason}`,
      };
    }
  }

  return {
    decision: "allow",
    optionId: allow.optionId,
    reason:
      locations.length > 0
        ? `${allow.kind}; ${locations.length} location(s) within task cwd`
        : command
          ? `${allow.kind}; command verified within task cwd`
          : `${allow.kind}; no locations reported (unverified)`,
  };
};

export type PermissionPrompter = (
  task: TaskContract,
  request: RequestPermissionRequest,
  command: string | null,
) => Promise<PermissionDecision>;

/**
 * Creates a permission policy that enforces strict directory confinement
 * first, and then delegates to an interactive prompter for shell commands.
 */
export function createGuardedPermissionPolicy(
  prompter?: PermissionPrompter,
): PermissionPolicy {
  return async (task, request) => {
    const autoDecision = await confineToTaskDir(task, request);
    if (autoDecision.decision === "reject") {
      return autoDecision;
    }

    const command = extractCommand(request.toolCall.rawInput);
    const isExecute = request.toolCall.kind === "execute" || command !== null;
    if (isExecute && prompter) {
      return await prompter(task, request, command);
    }

    return autoDecision;
  };
}

/** Refuse everything. Useful for dry runs and for eval baselines. */
export const rejectAll: PermissionPolicy = () => ({
  decision: "reject",
  reason: "policy: rejectAll",
});

export function toAcpResponse(
  decision: PermissionDecision,
): RequestPermissionResponse {
  return decision.decision === "allow"
    ? { outcome: { outcome: "selected", optionId: decision.optionId } }
    : { outcome: { outcome: "cancelled" } };
}

