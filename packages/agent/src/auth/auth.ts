import { spawn, type ChildProcess } from "node:child_process";
import type { AuthMethod, AuthMethodTerminal } from "@weave/protocol";
import { AUTH_OUTPUT_MAX_LINES } from "@weave/protocol";
import { resolveEngineEntry, type EngineDescriptor } from "../engines/index.ts";
import { augmentPathWithUserDirs } from "../spawn/index.ts";
import { stripAnsi } from "./ansi.ts";
import type {
  RunTerminalAuthOptions,
  TerminalAuthCommand,
  TerminalAuthMeta,
  TerminalAuthResult,
} from "./types.ts";

export function terminalAuthCommand(
  engine: EngineDescriptor,
  method: AuthMethodTerminal,
): TerminalAuthCommand {
  const env = { ...(engine.env ?? {}), ...(method.env ?? {}) };

  const meta = (method._meta as Record<string, unknown> | null | undefined)?.[
    "terminal-auth"
  ] as TerminalAuthMeta | undefined;
  if (typeof meta?.command === "string" && Array.isArray(meta.args)) {
    return {
      command: meta.command,
      args: meta.args.filter((arg): arg is string => typeof arg === "string"),
      env,
    };
  }

  return {
    command: process.execPath,
    args: [
      resolveEngineEntry(engine),
      ...(engine.args ?? []),
      ...(method.args ?? []),
    ],
    env,
  };
}

export function isTerminalMethod(
  method: AuthMethod,
): method is AuthMethodTerminal & { type: "terminal" } {
  return "type" in method && method.type === "terminal";
}

function createStreamCollector(onOutput: (lines: string[]) => void) {
  const output: string[] = [];
  let tail = "";

  const push = (chunk: string) => {
    const stripped = stripAnsi(chunk);
    const lines = (tail + stripped).split(/\r?\n|\r/);
    tail = lines.pop() ?? "";
    let changed = false;
    for (const line of lines) {
      output.push(line);
      changed = true;
    }
    const view = tail ? [...output, tail] : output;
    if (view.length > AUTH_OUTPUT_MAX_LINES) {
      view.splice(0, view.length - AUTH_OUTPUT_MAX_LINES);
    }
    if (changed || tail) onOutput([...view]);
  };

  const finalize = () => {
    if (tail) output.push(tail);
    return output.slice(-AUTH_OUTPUT_MAX_LINES);
  };

  return { push, finalize };
}

function spawnTerminalAuthProcess(
  options: RunTerminalAuthOptions,
  command: TerminalAuthCommand,
): ChildProcess {
  const stdio: ["pipe" | "ignore", "pipe", "pipe"] = [
    options.input != null ? "pipe" : "ignore",
    "pipe",
    "pipe",
  ];
  return spawn(command.command, command.args, {
    cwd: options.cwd,
    stdio,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PATH: augmentPathWithUserDirs(process.env.PATH),
      ...command.env,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
    },
  });
}

export function runTerminalAuth(
  options: RunTerminalAuthOptions,
): Promise<TerminalAuthResult> {
  const command = terminalAuthCommand(options.engine, options.method);

  return new Promise((resolve) => {
    const child = spawnTerminalAuthProcess(options, command);
    if (options.input != null && child.stdin) {
      child.stdin.write(options.input + "\n");
      child.stdin.end();
    }

    const collector = createStreamCollector(options.onOutput);
    let settled = false;

    const finish = (ok: boolean, code: number | null) => {
      if (settled) return;
      settled = true;
      resolve({ ok, code, output: collector.finalize() });
    };

    const abort = () => {
      child.kill("SIGTERM");
      const killTimer = setTimeout(() => child.kill("SIGKILL"), 2000);
      killTimer.unref?.();
      finish(false, null);
    };
    options.signal?.addEventListener("abort", abort, { once: true });

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", collector.push);
    child.stderr?.on("data", collector.push);

    child.on("error", (error) => {
      collector.push(String(error instanceof Error ? error.message : error));
      finish(false, null);
    });
    child.on("close", (code) => finish(code === 0, code));
  });
}
