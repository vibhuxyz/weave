import { AuthRequiredError, EngineStartError } from "./errors.ts";
import type { SpawnedAgent } from "../spawn/index.ts";

/** The stream tears down before `exit` fires, so give the signal a moment. */
const EXIT_GRACE_MS = 400;

function waitForExit(spawned: SpawnedAgent, graceMs: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      spawned.child.off("exit", done);
      resolve();
    };
    const timer = setTimeout(done, graceMs);
    timer.unref?.();
    spawned.child.once("exit", done);
  });
}

/**
 * Replace a generic transport failure with the engine's own crash, when the
 * process is what actually went away. A real protocol error — or an auth
 * challenge, which drives the sign-in UI — passes through untouched.
 */
export async function asEngineFailure(
  spawned: SpawnedAgent,
  error: unknown,
): Promise<unknown> {
  if (error instanceof AuthRequiredError) return error;
  if (!spawned.exitInfo().exited) await waitForExit(spawned, EXIT_GRACE_MS);

  const exit = spawned.exitInfo();
  if (!exit.exited) return error;
  return new EngineStartError(
    spawned.engine.id,
    spawned.engine.label,
    { code: exit.code, signal: exit.signal },
    spawned.stderrTail(),
  );
}
