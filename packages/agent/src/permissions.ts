import { relative, resolve } from "node:path";
import type {
  RequestPermissionRequest,
  RequestPermissionResponse,
} from "@berd/protocol";
import type { TaskContract } from "@berd/protocol";

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

/** Is `candidate` inside `root`? Used for both reads and writes. */
export function isInside(root: string, candidate: string): boolean {
  const rel = relative(resolve(root), resolve(candidate));
  return rel !== ".." && !rel.startsWith(`..${"/"}`) && !rel.startsWith("../");
}

/**
 * The default policy: allow anything the agent asks for **within the task's
 * cwd**, reject everything else.
 *
 * `allowedPaths` narrowing lands with worktrees at V0.2; the boundary that
 * matters today is the directory, which the file-I/O handlers also enforce.
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

  return {
    decision: "allow",
    optionId: allow.optionId,
    reason: `${allow.kind}; within task cwd`,
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
