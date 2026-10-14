import type { AuthMethod } from "@weave/protocol";

export class AuthRequiredError extends Error {
  readonly engineId: string;
  readonly authMethods: AuthMethod[];

  constructor(engineId: string, authMethods: AuthMethod[], cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "AuthRequiredError";
    this.engineId = engineId;
    this.authMethods = authMethods;
  }
}

/**
 * The engine produced no protocol traffic for the whole stall window while a
 * turn was in flight, so its process group was killed. Distinct from a crash:
 * nothing failed, the engine simply stopped answering.
 */
export interface EngineStalledErrorOptions {
  readonly engineId: string;
  readonly engineLabel: string;
  readonly timeoutMs: number;
  readonly runningTools: readonly string[];
}

const MAX_STALL_TOOL_TITLE_CHARS = 80;
const MAX_STALL_TOOL_NAMES = 3;

function describeRunningTools(titles: readonly string[]): string {
  if (titles.length === 0) return "";
  const shown = titles
    .slice(0, MAX_STALL_TOOL_NAMES)
    .map((title) => `"${title.replace(/\s+/g, " ").trim().slice(0, MAX_STALL_TOOL_TITLE_CHARS)}"`);
  const hiddenCount = titles.length - shown.length;
  const listed = hiddenCount > 0 ? [...shown, `(+${hiddenCount} more)`] : shown;
  return ` while running ${listed.join(", ")}`;
}

export class EngineStalledError extends Error {
  readonly engineId: string;
  readonly timeoutMs: number;
  readonly runningTools: readonly string[];

  constructor({ engineId, engineLabel, timeoutMs, runningTools }: EngineStalledErrorOptions) {
    super(
      `${engineLabel} stopped responding for ${Math.round(timeoutMs / 1000)}s${describeRunningTools(runningTools)} and was stopped. Send your message again.`,
    );
    this.name = "EngineStalledError";
    this.engineId = engineId;
    this.timeoutMs = timeoutMs;
    this.runningTools = runningTools;
  }
}

/**
 * The engine process died instead of completing the ACP handshake. Carries the
 * engine's own stderr, because "ACP connection closed" on its own tells the
 * user nothing about a missing native module or an unresolvable dependency.
 */
export class EngineStartError extends Error {
  readonly engineId: string;
  readonly exitCode: number | null;
  readonly stderr: string;

  constructor(
    engineId: string,
    engineLabel: string,
    exit: { code: number | null; signal: NodeJS.Signals | null },
    stderr: string,
  ) {
    const how = exit.signal ? `was killed by ${exit.signal}` : `exited with status ${exit.code ?? "unknown"}`;
    super(
      stderr
        ? `${engineLabel} ${how} before it could start. It reported:\n${stderr}`
        : `${engineLabel} ${how} before it could start, and wrote nothing to stderr.`,
    );
    this.name = "EngineStartError";
    this.engineId = engineId;
    this.exitCode = exit.code;
    this.stderr = stderr;
  }
}
