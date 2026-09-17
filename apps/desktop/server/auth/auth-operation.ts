import {
  ENGINES,
  isTerminalMethod,
  runTerminalAuth,
  type EngineDescriptor,
  type EngineSupervisor,
} from "@weave/agent";
import type {
  AuthMethod,
  AuthMethodTerminal,
  EngineAuthOperation,
} from "@weave/protocol";
import { resolveEngineFallbackMethods } from "./fallback-methods.ts";
import { patchCodexTerminalMethod } from "./codex-patch.ts";

export function resolveEngineAuthMethod(
  engineId: string,
  methodId: string,
  authMethodsByEngine: Map<string, AuthMethod[]>,
): { readonly normalizedEngineId: string; readonly method: AuthMethod | null } {
  const normalizedEngineId =
    engineId === "agy" || engineId === "antigravity" ? "antigravity" : engineId;

  const existingMethods =
    authMethodsByEngine.get(engineId) ??
    authMethodsByEngine.get(normalizedEngineId) ??
    [];

  const resolvedMethods = resolveEngineFallbackMethods(normalizedEngineId, existingMethods);
  authMethodsByEngine.set(normalizedEngineId, resolvedMethods);

  let method = resolvedMethods.find((m) => m.id === methodId) ?? resolvedMethods[0] ?? null;
  if (method) {
    method = patchCodexTerminalMethod(method, normalizedEngineId);
  }

  return { normalizedEngineId, method };
}

async function executeTerminalAuthStep(options: {
  readonly engine: EngineDescriptor;
  readonly method: AuthMethodTerminal;
  readonly secret?: string;
  readonly projectDir: string;
  readonly abort: AbortController;
  readonly publishAuth: (patch: Partial<EngineAuthOperation>) => void;
}): Promise<boolean> {
  const { engine, method, secret, projectDir, abort, publishAuth } = options;
  publishAuth({ phase: "authenticating" });
  const result = await runTerminalAuth({
    engine,
    method,
    cwd: projectDir,
    input: secret,
    signal: abort.signal,
    onOutput: (lines) => {
      publishAuth({ output: lines });
    },
  });

  return result.ok;
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
  const engine = ENGINES[options.normalizedEngineId as keyof typeof ENGINES];
  if (!engine) {
    options.publishAuth({ status: "failed", error: "Engine not found" });
    return;
  }

  try {
    if (options.normalizedEngineId === "antigravity") {
      options.publishAuth({ phase: "authenticating" });
      const ok = await options.bindEngine(options.normalizedEngineId);
      if (ok) {
        options.publishAuth({ status: "succeeded", phase: "authenticating" });
      } else {
        options.publishAuth({ status: "failed", error: "Authentication failed" });
      }
      return;
    }

    if (isTerminalMethod(options.method)) {
      const ok = await executeTerminalAuthStep({
        engine,
        method: options.method,
        secret: options.secret,
        projectDir: options.projectDir,
        abort: options.abort,
        publishAuth: options.publishAuth,
      });

      if (ok) {
        options.publishAuth({ status: "succeeded", phase: "authenticating" });
        await options.bindEngine(options.normalizedEngineId);
      } else {
        options.publishAuth({ status: "failed", error: "Authentication failed or canceled" });
      }
    } else {
      options.publishAuth({ status: "failed", error: "Unsupported auth method" });
    }
  } catch (err) {
    options.publishAuth({
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
