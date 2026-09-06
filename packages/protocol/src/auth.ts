/**
 * Engine authentication.
 *
 * An ACP engine may refuse `session/new` until the user has signed in. It
 * announces how at `initialize`, in `authMethods` — and Weave used to throw
 * that away, then surface the engine's raw refusal as a toast with no action
 * on it. The user saw "Authentication required: …" and had nothing to click.
 *
 * The shape below mirrors Berd's `AgentSetupOperation`, and for the same
 * reason: **the backend owns the operation and the UI is a pure view of it.**
 * Every change ships the whole bounded snapshot rather than a delta, so there
 * is no incremental merge for a reconnecting client to get wrong, and a
 * remount rehydrates by asking for the current snapshot.
 */

import type { AuthMethod } from "./acp.ts";

export type EngineAuthPhase =
  | "idle"
  /** Spawning the login process. */
  | "starting"
  /** The login process is running — usually waiting on a browser round trip. */
  | "authenticating"
  /** Login exited cleanly; re-opening a session to confirm it took. */
  | "verifying";

export type EngineAuthStatus = "running" | "succeeded" | "failed";

/** How Weave should carry out one {@link AuthMethod}. */
export type AuthMethodKind =
  /** Run a command that talks to the user — a device code, a browser flow. */
  | "terminal"
  /** The engine reads a variable from its own environment. Nothing to run. */
  | "env_var"
  /** The engine handles it internally; a bare `authenticate` call is enough. */
  | "agent";

/**
 * One auth method, flattened for the UI.
 *
 * `AuthMethod`'s union is discriminated by an optional `type` that is absent
 * for the agent-handled default, which makes it awkward to render directly.
 * This is the same data with the discriminant always present.
 */
export interface EngineAuthMethod {
  id: string;
  name: string;
  description: string | null;
  kind: AuthMethodKind;
}

/**
 * One engine's in-flight (or just-finished) sign-in.
 *
 * `output` is the tail of the login process's combined stdout/stderr. It is
 * bounded — a login that loops must not grow this without limit — and it is
 * the whole point of the feature: device codes and verification URLs are
 * printed there, and the user has to be able to read and copy them.
 */
export interface EngineAuthOperation {
  engineId: string;
  methodId: string;
  phase: EngineAuthPhase;
  status: EngineAuthStatus;
  output: string[];
  error: string | null;
}

/** Keep the snapshot small enough to ship on every change. */
export const AUTH_OUTPUT_MAX_LINES = 200;

/**
 * Does this error mean "sign in first"?
 *
 * Matched on the message because ACP has no auth error code: engines report it
 * as a plain JSON-RPC error. Deliberately narrow — a false positive would
 * offer a sign-in button for an unrelated crash, which is worse than showing
 * the raw error.
 */
export function isAuthRequiredError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return /auth[_ ]?required|authentication required|not authenticated|requires? (?:you to )?(?:sign|log) ?in|unauthenticated/i.test(
    message,
  );
}

/** Flatten ACP's `AuthMethod` union into something renderable. */
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
