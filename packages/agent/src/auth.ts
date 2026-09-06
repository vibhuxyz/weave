import { spawn } from "node:child_process";
import type { AuthMethod, AuthMethodTerminal } from "@weave/protocol";
import { AUTH_OUTPUT_MAX_LINES } from "@weave/protocol";
import type { EngineDescriptor } from "./engines-registry.ts";
import { resolveEngineEntry } from "./engines.ts";

/**
 * Signing in to an engine.
 *
 * ACP's `authenticate` is enough for engines that handle auth themselves, but
 * it is a no-op for a `terminal` method: agy-acp answers `{}` and stays
 * unauthenticated, because the contract is that the *client* runs a command
 * the user can interact with. That command prints a URL and a device code, and
 * a human has to read them — so the output is the feature, not a side effect.
 */

export interface TerminalAuthCommand {
  command: string;
  args: string[];
  env: Record<string, string>;
}

interface TerminalAuthMeta {
  command?: unknown;
  args?: unknown;
}

/**
 * Build the command line for a `terminal` auth method.
 *
 * The spec says only "run the agent with these args", so the default is the
 * engine's own entry plus its usual args plus the method's. When the engine
 * additionally publishes `_meta["terminal-auth"]` — agy-acp does — that is
 * authoritative and wins, because the engine knows its own invocation better
 * than we can reconstruct it.
 */
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
    // `process.execPath`, not a bare "node": a packaged app has no node on
    // PATH, and this process is already running under the right one.
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

export interface RunTerminalAuthOptions {
  engine: EngineDescriptor;
  method: AuthMethodTerminal;
  cwd: string;
  /** Called on every output change, with the whole bounded tail. */
  onOutput(lines: string[]): void;
  /** Abort the login (user cancelled, connection closed). */
  signal?: AbortSignal;
}

export interface TerminalAuthResult {
  ok: boolean;
  code: number | null;
  output: string[];
}

/**
 * Run a terminal auth command to completion, streaming its output.
 *
 * stdout and stderr are merged on purpose: CLIs split prompts and codes across
 * the two with no consistency, and a device code printed to stderr is exactly
 * as load-bearing as one printed to stdout.
 */
export function runTerminalAuth(
  options: RunTerminalAuthOptions,
): Promise<TerminalAuthResult> {
  const { command, args, env } = terminalAuthCommand(
    options.engine,
    options.method,
  );

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        ...env,
        // Login CLIs hide prompts and spinners when they think nothing is
        // watching. We are relaying every line to a human, so say so.
        FORCE_COLOR: "0",
        CI: "",
      },
    });

    const output: string[] = [];
    let tail = "";
    let settled = false;

    const push = (chunk: string) => {
      const lines = (tail + chunk).split(/\r?\n|\r/);
      tail = lines.pop() ?? "";
      let changed = false;
      for (const line of lines) {
        output.push(line);
        changed = true;
      }
      // A device code often arrives without a trailing newline, so show the
      // partial line too rather than making the user wait for one.
      const view = tail ? [...output, tail] : output;
      if (view.length > AUTH_OUTPUT_MAX_LINES) {
        view.splice(0, view.length - AUTH_OUTPUT_MAX_LINES);
      }
      if (changed || tail) options.onOutput([...view]);
    };

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", push);
    child.stderr?.on("data", push);

    const finish = (ok: boolean, code: number | null) => {
      if (settled) return;
      settled = true;
      if (tail) output.push(tail);
      resolve({ ok, code, output: output.slice(-AUTH_OUTPUT_MAX_LINES) });
    };

    const abort = () => {
      child.kill("SIGTERM");
      // The flow is usually blocked on a browser round trip and will not
      // notice SIGTERM. Do not leave it running.
      setTimeout(() => child.kill("SIGKILL"), 2000).unref?.();
      finish(false, null);
    };
    options.signal?.addEventListener("abort", abort, { once: true });

    child.on("error", (error) => {
      output.push(String(error instanceof Error ? error.message : error));
      finish(false, null);
    });
    child.on("close", (code) => finish(code === 0, code));
  });
}
