import type {
  RequestPermissionRequest,
  RequestPermissionResponse,
} from "@weave/protocol";
import type { PermissionDecision } from "./types.ts";

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
