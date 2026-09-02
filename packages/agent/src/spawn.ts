import { spawn, type ChildProcess } from "node:child_process";
import {
  DEFAULT_ENGINE_ID,
  getEngine,
  resolveEngineEntry,
  type AcpEngine,
} from "./engines.ts";

export interface SpawnedAgent {
  child: ChildProcess;
  engine: AcpEngine;
  entry: string;
  /** End stdin, then SIGKILL if it has not exited within `graceMs`. */
  stop(graceMs?: number): void;
}

/**
 * Start one ACP engine process in `cwd`.
 *
 * stdin/stdout are pipes because ACP rides on them. stderr is inherited on
 * purpose: it carries the engine's crash output, and piping it without
 * draining would both hide errors and eventually block the child on a full
 * pipe buffer.
 */
export function spawnAgent(
  cwd: string,
  engineId: string = DEFAULT_ENGINE_ID,
): SpawnedAgent {
  const engine = getEngine(engineId);
  const entry = resolveEngineEntry(engine);

  const child = spawn(process.execPath, [entry, ...(engine.args ?? [])], {
    cwd,
    stdio: ["pipe", "pipe", "inherit"],
    env: {
      ...process.env,
      // Lets this work when the host binary is Electron rather than plain Node.
      ELECTRON_RUN_AS_NODE: "1",
      ...engine.env,
    },
  });

  // The engine may still be mid-write when the pipes go away. Without these,
  // that surfaces as an unhandled EPIPE that kills the host process.
  const ignoreEpipe = (label: string) => (error: NodeJS.ErrnoException) => {
    if (error.code !== "EPIPE") console.error(`[agent ${label}]`, error);
  };
  child.stdin?.on("error", ignoreEpipe("stdin"));
  child.stdout?.on("error", ignoreEpipe("stdout"));

  return {
    child,
    engine,
    entry,
    stop(graceMs = 2000) {
      child.stdin?.end();
      const kill = setTimeout(() => child.kill("SIGKILL"), graceMs);
      child.once("exit", () => clearTimeout(kill));
    },
  };
}
