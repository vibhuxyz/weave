import { engineSetupState, type EngineDescriptor, type PtyTerminalAuth } from "@weave/agent";
import type { Logger } from "../logging/index.ts";
import { awaitSetupCompletion, setupMarkerPath } from "./completion.ts";
import type { SetupOutcome } from "./types.ts";

export interface SettleSetupOptions {
  readonly engine: EngineDescriptor;
  readonly session: PtyTerminalAuth;
  readonly abort: AbortController;
  readonly log: Logger;
}

/**
 * Wait for the wizard to finish, whichever way it finishes first.
 *
 * Completion is the marker file appearing, not the process exiting: `agy`
 * drops into its interactive CLI once the wizard is done and never exits, so
 * waiting on the process alone would wait forever.
 */
export async function settleSetup({
  engine,
  session,
  abort,
  log,
}: SettleSetupOptions): Promise<SetupOutcome> {
  const watch = new AbortController();
  const stopWatch = () => watch.abort();
  abort.signal.addEventListener("abort", stopWatch, { once: true });
  try {
    return await raceToCompletion({ engine, session, abort, log, watch });
  } finally {
    abort.signal.removeEventListener("abort", stopWatch);
    watch.abort();
  }
}

async function raceToCompletion({
  engine,
  session,
  abort,
  log,
  watch,
}: SettleSetupOptions & { readonly watch: AbortController }): Promise<SetupOutcome> {
  const finished = await Promise.race([
    session.result.then(() => "exited" as const),
    awaitSetupCompletion({ engine, signal: watch.signal }).then((done) =>
      done ? ("completed" as const) : ("aborted" as const),
    ),
  ]);

  if (finished === "completed") {
    log.info("wizard completed", { marker: setupMarkerPath(engine) });
    abort.abort();
    await session.result;
    return { ok: true, error: null };
  }

  const result = await session.result;
  const { required } = engineSetupState(engine);
  log.info("wizard process ended", { ok: result.ok, code: result.code, required });
  if (!required) return { ok: true, error: null };

  return {
    ok: false,
    error: result.ok
      ? "Setup closed before it finished. Run it again and complete every step."
      : "Setup did not complete.",
  };
}
