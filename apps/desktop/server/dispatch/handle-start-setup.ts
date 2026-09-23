import { getEngine } from "@weave/agent";
import { createLogger } from "../logging/index.ts";
import { ConsentSession, runEngineSetup, type ActiveSetup } from "../setup/index.ts";
import type { ServerMessage } from "../shared/index.ts";

const log = createLogger("setup.start");

export interface StartSetupOptions {
  readonly engineId: string;
  readonly projectDir: string;
  readonly activeSetup: ActiveSetup;
  readonly send: (msg: ServerMessage) => void;
  readonly queueTask: (fn: () => Promise<unknown>) => void;
}

export function handleStartSetup({
  engineId,
  projectDir,
  activeSetup,
  send,
  queueTask,
}: StartSetupOptions): void {
  if (activeSetup.isRunning) {
    log.warn("setup already running, ignoring the request", { engineId });
    return;
  }

  const abort = activeSetup.start(engineId);
  const consent = new ConsentSession(engineId, send);
  activeSetup.attachConsent(consent);
  send({ type: "setup-state", engineId, status: "running", error: null });

  queueTask(async () => {
    try {
      const outcome = await runEngineSetup({
        engineId,
        consent,
        projectDir,
        abort,
        send,
        onSessionReady: (session) => activeSetup.attach(session),
      });
      log.info("setup finished", { engineId, ok: outcome.ok, error: outcome.error });
      send({
        type: "setup-state",
        engineId,
        status: outcome.ok ? "succeeded" : "failed",
        error: outcome.error,
      });
    } catch (err: unknown) {
      log.error("setup threw", { engineId, error: err });
      send({
        type: "setup-state",
        engineId,
        status: "failed",
        error: `Could not run ${getEngine(engineId).label} setup: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      activeSetup.finish();
    }
  });
}
