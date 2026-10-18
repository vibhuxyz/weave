import { spawn } from "node:child_process";
import { MAX_GIT_STDOUT_BYTES } from "../constants.ts";
import type { DiffResult } from "../types.ts";

const GIT_BASE_ARGS = ["-c", "core.quotepath=off", "-c", "color.ui=false"] as const;

function collector(limit: number) {
  const chunks: Buffer[] = [];
  let size = 0;
  return {
    push(chunk: Buffer) {
      if (size >= limit) return;
      const room = limit - size;
      const slice = chunk.length > room ? chunk.subarray(0, room) : chunk;
      chunks.push(slice);
      size += slice.length;
    },
    get truncated() {
      return size >= limit;
    },
    buffer() {
      return Buffer.concat(chunks);
    },
  };
}

export interface GitStdout {
  readonly stdout: Buffer;
  readonly truncated: boolean;
}

export function runGitStdout(
  cwd: string,
  args: readonly string[],
  limit: number = MAX_GIT_STDOUT_BYTES,
): Promise<DiffResult<GitStdout>> {
  return new Promise((done) => {
    const child = spawn("git", [...GIT_BASE_ARGS, ...args], { cwd, stdio: ["ignore", "pipe", "pipe"] });
    const out = collector(limit);
    const err = collector(4_000);
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.on("error", (error) => done({ ok: false, reason: `Cannot run git ${args[0] ?? ""}: ${error.message}` }));
    child.on("close", (code) => {
      if (code !== 0) {
        const detail = err.buffer().toString("utf8").trim();
        done({ ok: false, reason: detail || `git ${args[0] ?? ""} exited with code ${String(code)}` });
        return;
      }
      done({ ok: true, value: { stdout: out.buffer(), truncated: out.truncated } });
    });
  });
}

export async function gitText(cwd: string, args: readonly string[]): Promise<DiffResult<string>> {
  const run = await runGitStdout(cwd, args);
  if (!run.ok) return run;
  return { ok: true, value: run.value.stdout.toString("utf8") };
}
