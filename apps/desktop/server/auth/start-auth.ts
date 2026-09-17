import { ENGINES } from "@weave/agent";
import type { AuthMethod } from "@weave/protocol";
import type { ServerMessage } from "../shared/index.ts";
import { resolveEngineAuthMethod, executeAuthOperation } from "./auth-operation.ts";
import type { ActiveAuthSession } from "./types.ts";

export interface StartAuthInput {
  readonly engineId: string;
  readonly methodId: string;
  readonly secret?: string;
  readonly projectDir: string;
  readonly authMethodsByEngine: Map<string, AuthMethod[]>;
  readonly getAuthSession: () => ActiveAuthSession | null;
  readonly setAuthSession: (session: ActiveAuthSession | null) => void;
  readonly publishAuth: (patch: Partial<ActiveAuthSession["operation"]>) => void;
  readonly send: (msg: ServerMessage) => void;
  readonly queueTask: (fn: () => Promise<unknown>) => void;
  readonly getSupervisor: () => import("@weave/agent").EngineSupervisor | null;
  readonly bindEngine: (engineId: string) => Promise<boolean>;
}

export function handleStartAuth(input: StartAuthInput): void {
  if (input.getAuthSession()?.operation.status === "running") return;

  const { normalizedEngineId, method } = resolveEngineAuthMethod(
    input.engineId,
    input.methodId,
    input.authMethodsByEngine,
  );

  if (!ENGINES[normalizedEngineId as keyof typeof ENGINES] || !method) {
    input.send({ type: "error", message: "That sign-in is no longer available." });
    return;
  }

  const abort = new AbortController();
  const auth: ActiveAuthSession = {
    abort,
    operation: {
      engineId: normalizedEngineId,
      methodId: input.methodId,
      phase: "starting",
      status: "running",
      output: [],
      error: null,
    },
  };

  input.setAuthSession(auth);
  input.send({ type: "auth-state", operation: auth.operation });

  input.queueTask(() =>
    executeAuthOperation({
      normalizedEngineId,
      method,
      secret: input.secret,
      projectDir: input.projectDir,
      abort,
      supervisor: input.getSupervisor(),
      publishAuth: input.publishAuth,
      bindEngine: input.bindEngine,
    }),
  );
}
