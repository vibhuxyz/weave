import type { AuthMethod, AuthMethodTerminal } from "@weave/protocol";
import type { EngineDescriptor, TerminalPromptAnswer } from "../engines/index.ts";

export interface TerminalAuthCommand {
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface TerminalAuthMeta {
  command?: unknown;
  args?: unknown;
}

export interface RunTerminalAuthOptions {
  engine: EngineDescriptor;
  method: AuthMethodTerminal;
  cwd: string;
  input?: string;
  onOutput(lines: string[]): void;
  signal?: AbortSignal;
}

export interface TerminalAuthResult {
  ok: boolean;
  code: number | null;
  output: string[];
}

export interface RunPtyTerminalAuthOptions {
  engine: EngineDescriptor;
  method: AuthMethodTerminal;
  cwd: string;
  promptAnswers: readonly TerminalPromptAnswer[];
  onOutput(lines: string[]): void;
  signal?: AbortSignal;
}

/**
 * How the PTY's output is presented.
 *
 * `transcript` keeps every line, which is what a login flow wants. `screen`
 * keeps only the page currently painted, which is what a full-screen wizard
 * needs — otherwise every page it has ever shown stacks up.
 */
export type PtyOutputMode = "transcript" | "screen";

/** A PTY session driven by an explicit command rather than an ACP auth method. */
export interface RunPtyCommandOptions {
  command: TerminalAuthCommand;
  cwd: string;
  promptAnswers: readonly TerminalPromptAnswer[];
  onOutput(lines: string[]): void;
  signal?: AbortSignal;
  outputMode?: PtyOutputMode;
}

export interface PtyTerminalAuth {
  readonly result: Promise<TerminalAuthResult>;
  submitLine(text: string): void;
  /**
   * Send raw terminal input. Used to drive a full-screen TUI (arrow keys,
   * space, enter) that a line-oriented `submitLine` cannot navigate.
   */
  submitKeys(keys: string): void;
}
