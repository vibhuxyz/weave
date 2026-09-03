#!/usr/bin/env node
/**
 * `pnpm dev` — start everything.
 *
 * Tauri already chains the rest: its `beforeDevCommand` starts Vite, and the
 * Rust shell spawns the Node ACP server, which spawns the agent. So the only
 * job here is to clear stale processes first.
 *
 * That matters because `tauri dev` does NOT reclaim its own ports: a Vite left
 * over from a killed run makes the next start die with "Port 5180 is already
 * in use", and a stale ACP server silently keeps serving the OLD code while
 * the window shows the new UI — which is worse, because it looks like it
 * worked.
 */

import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Ports the dev stack owns. Keep in sync with vite.config.ts and DEFAULT_PORT. */
const PORTS = [5180, 8137];

function freePorts() {
  if (process.platform === "win32") {
    console.log("[dev] skipping port cleanup (windows)");
    return;
  }

  for (const port of PORTS) {
    const found = spawnSync("lsof", ["-ti", `:${port}`], { encoding: "utf8" });
    const pids = (found.stdout ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    for (const pid of pids) {
      // Never kill ourselves, or the shell that launched us.
      if (Number(pid) === process.pid) continue;
      try {
        process.kill(Number(pid), "SIGKILL");
        console.log(`[dev] freed port ${port} (was pid ${pid})`);
      } catch {
        // Already gone, or not ours to kill. Either way, carry on.
      }
    }
  }
}

freePorts();

const child = spawn("pnpm", ["-F", "desktop", "tauri", "dev"], {
  cwd: root,
  stdio: "inherit",
});

// Pass signals through so ctrl-C stops the whole stack, not just this wrapper.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code) => process.exit(code ?? 0));
