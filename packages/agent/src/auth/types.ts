import type { AuthMethod, AuthMethodTerminal } from "@weave/protocol";
import type { EngineDescriptor } from "../engines/index.ts";

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
