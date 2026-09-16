import { ENGINES } from "@weave/agent";
import {
  resolveEngineAuthMethod,
  executeAuthOperation,
  type ActiveAuthSession,
} from "./authHandler.ts";
import type { DesktopSessionManager } from "./sessionManager.ts";
import type { ServerMessage } from "./server.types.ts";

export function handleStartAuth(options: {
  readonly engineId: string;
  readonly methodId: string;
  readonly secret?: string;
  readonly sessionMgr: DesktopSessionManager;
  readonly projectDir: string;
  readonly authMethodsByEngine: Map<string, any>;
  readonly getAuthSession: () => ActiveAuthSession | null;
  readonly setAuthSession: (session: ActiveAuthSession | null) => void;
  readonly publishAuth: (patch: Partial<ActiveAuthSession["operation"]>) => void;
  readonly send: (msg: ServerMessage) => void;
  readonly queueTask: (fn: () => Promise<unknown>) => void;
}): void {
  const {
    engineId,
    methodId,
    secret,
    sessionMgr,
    projectDir,
    authMethodsByEngine,
    getAuthSession,
    setAuthSession,
    publishAuth,
    send,
    queueTask,
  } = options;

  if (getAuthSession()?.operation.status === "running") return;

  const { normalizedEngineId, method } = resolveEngineAuthMethod(
    engineId,
    methodId,
    authMethodsByEngine,
  );

  if (!ENGINES[normalizedEngineId] || !method) {
    send({ type: "error", message: "That sign-in is no longer available." });
    return;
  }

  const abort = new AbortController();
  const auth: ActiveAuthSession = {
    abort,
    operation: {
      engineId: normalizedEngineId,
      methodId,
      phase: "starting",
      status: "running",
      output: [],
      error: null,
    },
  };

  setAuthSession(auth);
  send({ type: "auth-state", operation: auth.operation });

  queueTask(() =>
    executeAuthOperation({
      normalizedEngineId,
      method,
      secret,
      projectDir,
      abort,
      supervisor: sessionMgr.supervisor,
      publishAuth,
      bindEngine: (id) => sessionMgr.bindEngine(id),
    }),
  );
}
