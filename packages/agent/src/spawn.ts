import { spawn, type ChildProcess } from "node:child_process";
import {
  DEFAULT_ENGINE_ID,
  getEngine,
  resolveCodexCliEntry,
  resolveEngineArgs,
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

export interface SpawnAgentOptions {
  sandboxed?: boolean;
}

/**
 * Build a macOS Sandbox Profile (SBPL) that restricts the agent process.
 *
 * Denies:
 * - Read and write access to sensitive credentials: ~/.ssh, ~/.aws, ~/.gnupg, ~/.kube
 * - Write access globally, except cwd, temporary folders (/tmp, /var/folders),
 *   /dev, and standard agent caches (~/.claude, ~/.codex, ~/.gemini, ~/.cache).
 */
export function buildMacOsSandboxProfile(cwd: string): string {
  const home = process.env.HOME ?? "";
  const allowedWritePaths = [
    cwd,
    "/tmp",
    "/private/tmp",
    "/var/folders",
    "/private/var/folders",
    "/dev",
  ];
  if (home) {
    allowedWritePaths.push(
      `${home}/.cache`,
      `${home}/.local`,
      `${home}/.claude`,
      `${home}/.codex`,
      `${home}/.gemini`,
      `${home}/.config`,
    );
  }

  const sensitivePaths = home
    ? [
        `${home}/.ssh`,
        `${home}/.aws`,
        `${home}/.gnupg`,
        `${home}/.kube`,
      ]
    : [];

  const allowedWritesSbpl = allowedWritePaths
    .map((p) => `(allow file-write* (subpath "${p}"))`)
    .join("\n");

  const sensitiveDeniesSbpl = sensitivePaths
    .map((p) => `(deny file-read* file-write* (subpath "${p}"))`)
    .join("\n");

  return `(version 1)
(allow default)
(deny file-write*)
${allowedWritesSbpl}
${sensitiveDeniesSbpl}
`;
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
export function augmentPathWithUserDirs(basePath?: string): string {
  const home = process.env.HOME ?? "";
  const extraPaths = [
    home ? `${home}/.local/bin` : null,
    home ? `${home}/.cargo/bin` : null,
    home ? `${home}/bin` : null,
    "/opt/homebrew/bin",
    "/usr/local/bin",
  ].filter((p): p is string => Boolean(p));

  const currentPath = basePath ?? process.env.PATH ?? "";
  const segments = currentPath.split(":");
  const toPrepend = extraPaths.filter((p) => !segments.includes(p));
  return [...toPrepend, currentPath].filter(Boolean).join(":");
}

export function spawnAgent(
  cwd: string,
  engineIdOrOptions: string | (SpawnAgentOptions & { engineId?: string }) = DEFAULT_ENGINE_ID,
  options?: SpawnAgentOptions,
): SpawnedAgent {
  const resolvedEngineId =
    typeof engineIdOrOptions === "string"
      ? engineIdOrOptions
      : engineIdOrOptions.engineId ?? DEFAULT_ENGINE_ID;
  const resolvedOptions =
    typeof engineIdOrOptions === "object"
      ? engineIdOrOptions
      : options ?? {};

  const engine = getEngine(resolvedEngineId);
  const entry = resolveEngineEntry(engine);
  const engineArgs = resolveEngineArgs(engine, resolvedOptions);

  const extraEnv: Record<string, string> = { ...(engine.env ?? {}) };
  if (engine.id === "codex" && !process.env.CODEX_PATH) {
    try {
      const codexPath = resolveCodexCliEntry(engine);
      if (codexPath) {
        extraEnv.CODEX_PATH = codexPath;
      }
    } catch {}
  }

  let spawnBin = process.execPath;
  let spawnArgs = [entry, ...engineArgs];

  // When sandboxed on macOS, wrap execution under sandbox-exec
  if (resolvedOptions.sandboxed && process.platform === "darwin") {
    const profile = buildMacOsSandboxProfile(cwd);
    spawnBin = "/usr/bin/sandbox-exec";
    spawnArgs = ["-p", profile, process.execPath, entry, ...engineArgs];
  }

  const child = spawn(spawnBin, spawnArgs, {
    cwd,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      // Lets this work when the host binary is Electron rather than plain Node.
      ELECTRON_RUN_AS_NODE: "1",
      PATH: augmentPathWithUserDirs(process.env.PATH),
      ...extraEnv,
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
