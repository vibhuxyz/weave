import { engineSetupState, type EngineDescriptor } from "@weave/agent";

const MARKER_POLL_MS = 400;

export interface SetupCompletionOptions {
  readonly engine: EngineDescriptor;
  readonly signal: AbortSignal;
  /** Overridable for tests, the way `engineSetupState` takes it. */
  readonly home?: string;
}

export function setupMarkerPath(engine: EngineDescriptor): string | null {
  const { setup } = engineSetupState(engine);
  return setup ? `$HOME/${setup.completedWhenExists}` : null;
}

/**
 * Resolve once the engine's own marker file says the wizard is done.
 *
 * Polled rather than watched: the marker arrives inside a directory tree the
 * engine may create as it writes, and a watcher on a directory that does not
 * exist yet would never fire.
 */
export function awaitSetupCompletion({
  engine,
  signal,
  home,
}: SetupCompletionOptions): Promise<boolean> {
  return new Promise<boolean>((settle) => {
    if (signal.aborted) {
      settle(false);
      return;
    }

    const stop = () => {
      clearInterval(timer);
      signal.removeEventListener("abort", onAbort);
    };

    const onAbort = () => {
      stop();
      settle(false);
    };

    const timer = setInterval(() => {
      if (engineSetupState(engine, home).required) return;
      stop();
      settle(true);
    }, MARKER_POLL_MS);
    timer.unref?.();

    signal.addEventListener("abort", onAbort, { once: true });
  });
}
