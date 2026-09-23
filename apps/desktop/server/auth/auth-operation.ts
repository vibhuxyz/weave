import {
  ENGINES,
  isTerminalMethod,
  runTerminalAuth,
  startPtyTerminalAuth,
  type EngineDescriptor,
  type EngineSupervisor,
  type TerminalAuthResult,
} from "@weave/agent";
import type {
  AuthMethod,
  AuthMethodTerminal,
  EngineAuthOperation,
} from "@weave/protocol";
import { resolveEngineFallbackMethods } from "./fallback-methods.ts";
import { patchCodexTerminalMethod } from "./codex-patch.ts";

type PublishAuth = (patch: Partial<EngineAuthOperation>) => void;
type OnInputReady = (submitInput: ((text: string) => void) | null) => void;

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

  const method = resolvedMethods.find((m) => m.id === methodId) ?? null;
  return {
    normalizedEngineId,
    method: method ? patchCodexTerminalMethod(method, normalizedEngineId) : null,
  };
}

interface TerminalStepOptions {
  readonly engine: EngineDescriptor;
  readonly method: AuthMethodTerminal;
  readonly secret?: string;
  readonly projectDir: string;
  readonly abort: AbortController;
  readonly publishAuth: PublishAuth;
  readonly onInputReady: OnInputReady;
}

async function runTerminalProcess(options: TerminalStepOptions): Promise<TerminalAuthResult> {
  const { engine, publishAuth, abort } = options;
  const onOutput = (output: string[]) => publishAuth({ output });
  if (engine.terminalAuth?.transport !== "pty") {
    return runTerminalAuth({
      engine,
      method: options.method,
      cwd: options.projectDir,
      input: options.secret,
      signal: abort.signal,
      onOutput,
    });
  }

  const session = startPtyTerminalAuth({
    engine,
    method: options.method,
    cwd: options.projectDir,
    promptAnswers: engine.terminalAuth.promptAnswers,
    signal: abort.signal,
    onOutput,
  });
  options.onInputReady(session.submitLine);
  try {
    return await session.result;
  } finally {
    options.onInputReady(null);
  }
}

async function runTerminalStep(options: TerminalStepOptions): Promise<boolean> {
  const { publishAuth, abort } = options;
  publishAuth({ phase: "authenticating" });
  const result = await runTerminalProcess(options);

  if (result.ok) {
    publishAuth({ output: result.output });
    return true;
  }
  publishAuth({
    status: "failed",
    output: result.output,
    error: abort.signal.aborted
      ? "Sign-in cancelled."
      : `Sign-in exited with code ${result.code ?? "unknown"}.`,
  });
  return false;
}

async function confirmWithEngine(
  supervisor: EngineSupervisor | null,
  engineId: string,
  methodId: string,
): Promise<string | null> {
  if (supervisor?.current.engineId !== engineId) return null;
  try {
    await supervisor.current.authenticate(methodId);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function verifySignIn(options: {
  readonly engineId: string;
  readonly methodId: string;
  readonly supervisor: EngineSupervisor | null;
  readonly publishAuth: PublishAuth;
  readonly bindEngine: (engineId: string) => Promise<boolean>;
}): Promise<void> {
  options.publishAuth({ phase: "verifying" });
  const authenticateError = await confirmWithEngine(
    options.supervisor,
    options.engineId,
    options.methodId,
  );

  const isBound = await options.bindEngine(options.engineId);
  if (isBound) {
    options.publishAuth({ status: "succeeded", error: null });
    return;
  }
  options.publishAuth({
    status: "failed",
    error: authenticateError ?? "Signed in, but the engine still refuses a session.",
  });
}

export async function executeAuthOperation(options: {
  readonly normalizedEngineId: string;
  readonly method: AuthMethod;
  readonly secret?: string;
  readonly projectDir: string;
  readonly abort: AbortController;
  readonly supervisor: EngineSupervisor | null;
  readonly publishAuth: PublishAuth;
  readonly bindEngine: (engineId: string) => Promise<boolean>;
  readonly onInputReady: OnInputReady;
}): Promise<void> {
  const engine = ENGINES[options.normalizedEngineId as keyof typeof ENGINES];
  if (!engine) {
    options.publishAuth({ status: "failed", error: "Engine not found" });
    return;
  }

  try {
    if (isTerminalMethod(options.method)) {
      const isSignedIn = await runTerminalStep({ ...options, engine, method: options.method });
      if (!isSignedIn) return;
    }
    await verifySignIn({
      engineId: options.normalizedEngineId,
      methodId: options.method.id,
      supervisor: options.supervisor,
      publishAuth: options.publishAuth,
      bindEngine: options.bindEngine,
    });
  } catch (error) {
    options.publishAuth({
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
