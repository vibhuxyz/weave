import {
  ENGINES,
  isTerminalMethod,
  runTerminalAuth,
  type EngineSupervisor,
} from "@weave/agent";
import type { AuthMethod, EngineAuthOperation } from "@weave/protocol";
import {
  resolveEngineFallbackMethods,
  patchCodexTerminalMethod,
} from "./authFallbackMethods.ts";

export interface ActiveAuthSession {
  abort: AbortController;
  operation: EngineAuthOperation;
}

export function resolveEngineAuthMethod(
  engineId: string,
  methodId: string,
  authMethodsByEngine: Map<string, AuthMethod[]>,
): { normalizedEngineId: string; method: AuthMethod | null } {
  const normalizedEngineId =
    engineId === "agy" || engineId === "antigravity" ? "antigravity" : engineId;

  const existingMethods =
    authMethodsByEngine.get(engineId) ??
    authMethodsByEngine.get(normalizedEngineId) ??
    [];

  const resolvedMethods = resolveEngineFallbackMethods(normalizedEngineId, existingMethods);
  authMethodsByEngine.set(normalizedEngineId, resolvedMethods);

  let method = resolvedMethods.find((m) => m.id === methodId) ?? null;
  if (method) {
    method = patchCodexTerminalMethod(method, normalizedEngineId);
  }

  return { normalizedEngineId, method };
}

export async function executeAuthOperation(options: {
  readonly normalizedEngineId: string;
  readonly method: AuthMethod;
  readonly secret?: string;
  readonly projectDir: string;
  readonly abort: AbortController;
  readonly supervisor: EngineSupervisor | null;
  readonly publishAuth: (patch: Partial<EngineAuthOperation>) => void;
  readonly bindEngine: (engineId: string) => Promise<boolean>;
}): Promise<void> {
  const {
    normalizedEngineId,
    method,
    secret,
    projectDir,
    abort,
    supervisor,
    publishAuth,
    bindEngine,
  } = options;

  const engine = ENGINES[normalizedEngineId];
  if (!engine) {
    publishAuth({ status: "failed", error: "Engine not found" });
    return;
  }

  if (isTerminalMethod(method)) {
    publishAuth({ phase: "authenticating" });
    const result = await runTerminalAuth({
      engine,
      method,
      cwd: projectDir,
      input: secret,
      signal: abort.signal,
      onOutput: (output) => publishAuth({ output }),
    });

    if (!result.ok) {
      publishAuth({
        status: "failed",
        output: result.output,
        error: abort.signal.aborted
          ? "Sign-in cancelled."
          : `Sign-in exited with code ${result.code ?? "unknown"}.`,
      });
      return;
    }
    publishAuth({ output: result.output });
  }

  publishAuth({ phase: "verifying" });
  if (supervisor) {
    await supervisor.current.authenticate(method.id).catch(() => {});
  }

  const bound = await bindEngine(normalizedEngineId);
  publishAuth(
    bound
      ? { status: "succeeded", error: null }
      : {
          status: "failed",
          error: "Signed in, but the engine still refuses a session.",
        },
  );
}
