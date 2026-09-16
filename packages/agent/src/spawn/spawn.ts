import { spawn, type ChildProcess } from "node:child_process";
import {
  DEFAULT_ENGINE_ID,
  getEngine,
  resolveCodexCliEntry,
  resolveEngineArgs,
  resolveEngineEntry,
  type EngineDescriptor,
} from "../engines/index.ts";
import { buildMacOsSandboxProfile } from "./sandbox-profile.ts";
import { killGroup } from "./process-group.ts";
import type { SpawnAgentOptions, SpawnedAgent } from "./types.ts";

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

function resolveExtraEnv(engine: EngineDescriptor): Record<string, string> {
  const extraEnv: Record<string, string> = { ...(engine.env ?? {}) };
  if (engine.id === "codex" && !process.env.CODEX_PATH) {
    try {
      const codexPath = resolveCodexCliEntry(engine);
      if (codexPath) extraEnv.CODEX_PATH = codexPath;
    } catch {}
  }
  return extraEnv;
}

function resolveSpawnCommand(
  cwd: string,
  entry: string,
  engineArgs: string[],
  sandboxed?: boolean,
): { spawnBin: string; spawnArgs: string[] } {
  if (sandboxed && process.platform === "darwin") {
    const profile = buildMacOsSandboxProfile(cwd);
    return {
      spawnBin: "/usr/bin/sandbox-exec",
      spawnArgs: ["-p", profile, process.execPath, entry, ...engineArgs],
    };
  }
  return {
    spawnBin: process.execPath,
    spawnArgs: [entry, ...engineArgs],
  };
}

function attachStderrDrain(child: ChildProcess): void {
  let stderrTail = "";
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => {
    const lines = (stderrTail + chunk).split("\n");
    stderrTail = lines.pop() ?? "";
    for (const line of lines) {
      if (!STDERR_NOISE.some((re) => re.test(line))) {
        process.stderr.write(line + "\n");
      }
    }
  });
  child.stderr?.on("end", () => {
    if (stderrTail && !STDERR_NOISE.some((re) => re.test(stderrTail))) {
      process.stderr.write(stderrTail + "\n");
    }
  });
}

function attachPipeGuards(child: ChildProcess): void {
  const ignoreEpipe = (label: string) => (error: NodeJS.ErrnoException) => {
    if (error.code !== "EPIPE") console.error(`[agent ${label}]`, error);
  };
  child.stdin?.on("error", ignoreEpipe("stdin"));
  child.stdout?.on("error", ignoreEpipe("stdout"));
  child.stderr?.on("error", ignoreEpipe("stderr"));
  attachStderrDrain(child);
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
  const extraEnv = resolveExtraEnv(engine);
  const { spawnBin, spawnArgs } = resolveSpawnCommand(cwd, entry, engineArgs, resolvedOptions.sandboxed);

  const child = spawn(spawnBin, spawnArgs, {
    cwd,
    stdio: ["pipe", "pipe", "pipe"],
    detached: true,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PATH: augmentPathWithUserDirs(process.env.PATH),
      ...extraEnv,
    },
  });

  attachPipeGuards(child);

  return {
    child,
    engine,
    entry,
    stop(graceMs = 2000) {
      child.stdin?.end();
      const killTimer = setTimeout(() => killGroup(child.pid), graceMs);
      child.once("exit", () => {
        clearTimeout(killTimer);
        killGroup(child.pid);
      });
    },
  };
}
