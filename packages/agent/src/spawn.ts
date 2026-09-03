import { spawn, type ChildProcess } from "node:child_process";
import {
  DEFAULT_ENGINE_ID,
  getEngine,
  resolveEngineEntry,
  type EngineDescriptor,
} from "./engines.ts";

export interface SpawnedAgent {
  child: ChildProcess;
  engine: EngineDescriptor;
  entry: string;
  /** End stdin, then SIGKILL if it has not exited within `graceMs`. */
  stop(graceMs?: number): void;
}

/**
 * Start one ACP engine process in `cwd`.
 *
 * stdin/stdout are pipes because ACP rides on them. stderr is piped and
 * drained line by line: it carries the engine's crash output, which we
 * forward, but some engines (agy-acp) spew known-harmless decode warnings we
 * filter out. Draining is required either way so a full pipe buffer never
 * blocks the child.
 */

/**
 * Lines we swallow instead of forwarding to our stderr. `agy-acp` reverse-
 * engineers a protobuf blob in Antigravity's SQLite db; when that layout
 * drifts it logs one WARN per row and moves on. It only costs token-usage
 * stats, which we do not consume, so the noise is pure.
 */
const STDERR_NOISE = [/^\[agy-acp\] WARN: failed to decode gen_metadata /];
export function spawnAgent(
  cwd: string,
  engineId: string = DEFAULT_ENGINE_ID,
): SpawnedAgent {
  const engine = getEngine(engineId);
  const entry = resolveEngineEntry(engine);

  const child = spawn(process.execPath, [entry, ...(engine.args ?? [])], {
    cwd,
    stdio: ["pipe", "pipe", "pipe"],
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
  child.stderr?.on("error", ignoreEpipe("stderr"));

  // Line-buffer stderr so we can drop known noise and forward the rest.
  let stderrTail = "";
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => {
    const lines = (stderrTail + chunk).split("\n");
    stderrTail = lines.pop() ?? "";
    for (const line of lines) {
      if (!STDERR_NOISE.some((re) => re.test(line))) process.stderr.write(line + "\n");
    }
  });
  child.stderr?.on("end", () => {
    if (stderrTail && !STDERR_NOISE.some((re) => re.test(stderrTail))) {
      process.stderr.write(stderrTail + "\n");
    }
  });

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
