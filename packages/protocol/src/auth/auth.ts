import type { AuthMethod } from "../acp/index.ts";
import type { AuthMethodKind, EngineAuthMethod } from "./types.ts";

const AUTH_REQUIRED_PATTERN =
  /auth[_ ]?required|authentication required|not authenticated|requires? (?:you to )?(?:sign|log) ?in|unauthenticated|antigravity\.google\/terms|unauthorized|\b401\b|invalid[_ ]?api[_ ]?key|missing[_ ]?api[_ ]?key|oauth token|claude login|codex login|agy auth login|sign[_ ]?in required|login required|needs? (?:to )?(?:sign|log) ?in|authentication failed/i;

function hasAuthMethodsProperty(error: object): boolean {
  if ("authMethods" in error) return true;
  if (!("data" in error)) return false;
  const data = (error as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return false;
  return "authMethods" in data && (data as { authMethods?: unknown }).authMethods !== undefined;
}

export function isAuthRequiredError(error: unknown): boolean {
  if (typeof error === "object" && error !== null && hasAuthMethodsProperty(error)) {
    return true;
  }
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return AUTH_REQUIRED_PATTERN.test(message);
}

export function toEngineAuthMethod(method: AuthMethod): EngineAuthMethod {
  const kind: AuthMethodKind =
    "type" in method && method.type === "terminal"
      ? "terminal"
      : "type" in method && method.type === "env_var"
        ? "env_var"
        : "agent";
  return {
    id: method.id,
    name: method.name,
    description: method.description ?? null,
    kind,
  };
}
