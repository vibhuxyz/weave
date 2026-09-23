import type {
  RequestPermissionRequest,
  RequestPermissionResponse,
  ToolKind,
} from "@weave/protocol";
import type { PermissionDecision } from "./types.ts";

export const PLAN_MODE_ID = "plan";

/** Tool kinds that only gather information, so they belong in planning. */
const PLANNING_KINDS: ReadonlySet<ToolKind> = new Set([
  "read",
  "search",
  "think",
  "fetch",
  "switch_mode",
]);

/** A plan written to disk is the plan itself, not work done ahead of approval. */
const PLAN_DOCUMENT_PATTERN = /(?:^|\/)plans\/[^/]*\.md$/i;

const PLAN_MODE_REGEX = /\bexit\s?plan\s?mode\b|\bapprove plan\b|\bpresent(?:ing)? (?:the )?plan\b/;

export function isPlanModeExit(request: RequestPermissionRequest): boolean {
  const title = (request.toolCall.title ?? "").toLowerCase();
  if (PLAN_MODE_REGEX.test(title)) return true;

  const id = (request.toolCall.toolCallId ?? "").toLowerCase();
  if (id.includes("exitplanmode") || id.includes("exit_plan_mode")) return true;

  const raw = request.toolCall.rawInput;
  return (
    typeof raw === "object" &&
    raw !== null &&
    "plan" in (raw as Record<string, unknown>)
  );
}

export function isPlanDocument(request: RequestPermissionRequest): boolean {
  const locations = request.toolCall.locations ?? [];
  if (locations.some((location) => PLAN_DOCUMENT_PATTERN.test(location.path))) return true;
  return PLAN_DOCUMENT_PATTERN.test(request.toolCall.title ?? "");
}

/**
 * Whether this would change something, judged for a session that is planning.
 *
 * Plan mode is the user asking to see the work before it happens, so anything
 * that is not reading, searching or writing the plan itself counts — including
 * a tool that reports no kind at all, which is exactly when we know least.
 */
export function changesAnythingInPlanMode(
  request: RequestPermissionRequest,
  { commandIsReadOnly }: { readonly commandIsReadOnly: boolean },
): boolean {
  if (isPlanModeExit(request) || isPlanDocument(request)) return false;
  if (commandIsReadOnly) return false;
  const { kind } = request.toolCall;
  return kind == null || !PLANNING_KINDS.has(kind);
}

export function findAllowOption(
  request: RequestPermissionRequest,
): { optionId: string; kind: string } | null {
  const option =
    request.options.find((entry) => entry.kind === "allow_once") ??
    request.options.find((entry) => entry.kind === "allow_always");
  return option ? { optionId: option.optionId, kind: option.kind } : null;
}

export function findRejectOption(request: RequestPermissionRequest): string | null {
  const option =
    request.options.find((entry) => entry.kind === "reject_once") ??
    request.options.find((entry) => entry.kind === "reject_always");
  return option ? option.optionId : null;
}

export function toAcpResponse(
  decision: PermissionDecision,
): RequestPermissionResponse {
  if (decision.decision === "allow") {
    return { outcome: { outcome: "selected", optionId: decision.optionId } };
  }
  return decision.optionId
    ? { outcome: { outcome: "selected", optionId: decision.optionId } }
    : { outcome: { outcome: "cancelled" } };
}
