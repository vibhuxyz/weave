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
) => PermissionDecision;

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
 * The default policy: allow anything the agent asks for **within the task's
 * cwd**, minus anything `readOnlyPaths` forbids. Reject everything else.
 *
 * Two boundaries, in order:
 *
 *   1. the task directory — the outer wall
 *   2. `readOnlyPaths` — a deny list inside it, for files whose contents are
 *      the measurement (a test suite) and so must not be editable by the thing
 *      being measured
 *
 * `allowedPaths` narrowing is still NOT read: an allow-list is only meaningful
 * once each task owns a worktree, so it lands at MVP.1. A deny list needs no
 * worktree to mean something, which is why it is here now.
 */
export const confineToTaskDir: PermissionPolicy = (task, request) => {
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

  // KNOWN GAP, recorded rather than hidden: many tool calls report no
  // `locations` at all — a shell command, for instance — so this check passes
  // vacuously and cannot see where they write. The agent's cwd is the real
  // boundary for those, which is why `safeResolve` exists as a second defence
  // and why MVP.1's worktrees matter: containment, not inspection.
  return {
    decision: "allow",
    optionId: allow.optionId,
    reason:
      locations.length > 0
        ? `${allow.kind}; ${locations.length} location(s) within task cwd`
        : `${allow.kind}; no locations reported (unverified)`,
  };
};

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
