import { spawn as spawnPty, type IPty } from "node-pty";
import { AUTH_OUTPUT_MAX_LINES } from "@weave/protocol";
import type { TerminalPromptAnswer } from "../engines/index.ts";
import { augmentPathWithUserDirs } from "../spawn/index.ts";
import { terminalAuthCommand } from "./auth.ts";
import { ensurePtySpawnHelperExecutable } from "./pty-helper.ts";
import { currentScreen, mergeScreenLines, toScreenLines } from "./pty-screen.ts";
import { terminalQueryReplies } from "./terminal-replies.ts";
import type {
  PtyOutputMode,
  PtyTerminalAuth,
  RunPtyCommandOptions,
  RunPtyTerminalAuthOptions,
  TerminalAuthResult,
} from "./types.ts";

const PTY_COLUMNS = 1000;
const PTY_ROWS = 50;
const PTY_TERMINAL_NAME = "xterm-256color";
const MAX_RAW_OUTPUT_CHARS = 262_144;
const OUTPUT_FLUSH_INTERVAL_MS = 250;
const PROMPT_ANSWER_DELAY_MS = 500;
const SUBMIT_DELAY_MS = 150;
const FORCE_KILL_DELAY_MS = 2000;

interface PtyState {
  readonly pty: IPty;
  hasExited: boolean;
}

function spawnAuthPty(options: RunPtyCommandOptions): IPty {
  ensurePtySpawnHelperExecutable();
  const { command } = options;
  return spawnPty(command.command, command.args, {
    name: PTY_TERMINAL_NAME,
    cols: PTY_COLUMNS,
    rows: PTY_ROWS,
    cwd: options.cwd,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PATH: augmentPathWithUserDirs(process.env.PATH),
      ...command.env,
      TERM: PTY_TERMINAL_NAME,
    },
  });
}

function writeLater(state: PtyState, input: string, delayMs: number): void {
  setTimeout(() => {
    if (!state.hasExited) state.pty.write(input);
  }, delayMs);
}

function createPromptAnswerer(state: PtyState, answers: readonly TerminalPromptAnswer[]) {
  const answered = new Set<TerminalPromptAnswer>();
  return (lines: readonly string[]) => {
    const screen = lines.join("\n");
    for (const answer of answers) {
      if (answered.has(answer) || !screen.includes(answer.whenOutputIncludes)) continue;
      answered.add(answer);
      writeLater(state, answer.input, PROMPT_ANSWER_DELAY_MS);
    }
  };
}

function createScreenCollector(
  onLines: (lines: readonly string[]) => void,
  mode: PtyOutputMode = "transcript",
) {
  let raw = "";
  let lines: string[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    flushTimer = null;
    const painted = toScreenLines(mode === "screen" ? currentScreen(raw) : raw);
    const next =
      mode === "screen"
        ? painted.slice(-AUTH_OUTPUT_MAX_LINES)
        : mergeScreenLines(lines, painted, AUTH_OUTPUT_MAX_LINES);
    if (next.length === lines.length && next.every((line, index) => line === lines[index])) return;
    lines = next;
    onLines(lines);
  };

  return {
    push(chunk: string) {
      raw = (raw + chunk).slice(-MAX_RAW_OUTPUT_CHARS);
      flushTimer ??= setTimeout(flush, OUTPUT_FLUSH_INTERVAL_MS);
    },
    finish(): string[] {
      if (flushTimer) clearTimeout(flushTimer);
      flush();
      return [...lines];
    },
  };
}

function watchExit(
  state: PtyState,
  signal: AbortSignal | undefined,
  finish: (ok: boolean, code: number | null) => void,
): void {
  let killTimer: ReturnType<typeof setTimeout> | null = null;
  state.pty.onExit(({ exitCode }) => {
    state.hasExited = true;
    if (killTimer) clearTimeout(killTimer);
    finish(exitCode === 0, exitCode);
  });
  signal?.addEventListener(
    "abort",
    () => {
      if (!state.hasExited) {
        state.pty.kill();
        killTimer = setTimeout(() => {
          if (!state.hasExited) state.pty.kill("SIGKILL");
        }, FORCE_KILL_DELAY_MS);
      }
      finish(false, null);
    },
    { once: true },
  );
}

export function startPtyTerminalAuth(options: RunPtyTerminalAuthOptions): PtyTerminalAuth {
  return startPtyCommand({
    command: terminalAuthCommand(options.engine, options.method),
    cwd: options.cwd,
    promptAnswers: options.promptAnswers,
    onOutput: options.onOutput,
    signal: options.signal,
  });
}

/** Run a command in a PTY, streaming its screen and accepting keystrokes. */
export function startPtyCommand(options: RunPtyCommandOptions): PtyTerminalAuth {
  const state: PtyState = { pty: spawnAuthPty(options), hasExited: false };
  const answerPrompts = createPromptAnswerer(state, options.promptAnswers);
  const collector = createScreenCollector((lines) => {
    options.onOutput([...lines]);
    answerPrompts(lines);
  }, options.outputMode);

  state.pty.onData((chunk) => {
    for (const reply of terminalQueryReplies(chunk)) state.pty.write(reply);
    collector.push(chunk);
  });

  const result = new Promise<TerminalAuthResult>((resolve) => {
    let isSettled = false;
    watchExit(state, options.signal, (ok, code) => {
      if (isSettled) return;
      isSettled = true;
      resolve({ ok, code, output: collector.finish() });
    });
  });

  const submitLine = (text: string) => {
    if (state.hasExited) return;
    state.pty.write(text);
    writeLater(state, "\r", SUBMIT_DELAY_MS);
  };

  const submitKeys = (keys: string) => {
    if (state.hasExited) return;
    state.pty.write(keys);
  };

  return { result, submitLine, submitKeys };
}
