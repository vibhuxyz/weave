import { spawn } from "node:child_process";

export const OUTPUT_TAIL_BYTES = 8000;
const DEFAULT_COMMAND_TIMEOUT_MS = 5 * 60 * 1000;

function collectOutput(cap: number): { append: (chunk: Buffer) => void; get: () => string } {
  let output = "";
  return {
    append: (chunk: Buffer) => {
      output += chunk.toString();
      if (output.length > cap) output = output.slice(-cap);
    },
    get: () => output,
  };
}

export function runCommand(
  command: string,
  cwd: string,
  timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS,
): Promise<{ ok: boolean; code: number | null; output: string }> {
  return new Promise((done) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const output = collectOutput(OUTPUT_TAIL_BYTES);
    child.stdout.on("data", output.append);
    child.stderr.on("data", output.append);

    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      done({ ok: false, code: null, output: String(error) });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      done({ ok: code === 0, code, output: output.get() });
    });
  });
}

function killTree(pid: number | undefined): void {
  if (!pid) return;
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      return;
    }
  }
}

export function runBoot(
  command: string,
  cwd: string,
  holdMs: number,
): Promise<{ ok: boolean; code: number | null; output: string }> {
  return new Promise((done) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });

    const output = collectOutput(OUTPUT_TAIL_BYTES);
    let settled = false;
    child.stdout?.on("data", output.append);
    child.stderr?.on("data", output.append);

    const finish = (ok: boolean, code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      killTree(child.pid);
      done({ ok, code, output: output.get() });
    };

    child.on("error", (error) => {
      output.append(Buffer.from(String(error)));
      finish(false, null);
    });
    child.on("exit", (code) => finish(false, code));

    const timer = setTimeout(() => finish(true, null), holdMs);
  });
}
