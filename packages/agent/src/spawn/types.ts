import type { ChildProcess } from "node:child_process";
import type { EngineDescriptor } from "../engines/index.ts";

export interface EngineExit {
  readonly exited: boolean;
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}

export interface SpawnedAgent {
  child: ChildProcess;
  engine: EngineDescriptor;
  entry: string;
  /** Whether the process is gone, and how it went. */
  exitInfo(): EngineExit;
  /** Last bytes the engine wrote to stderr, capped. Empty when it said nothing. */
  stderrTail(): string;
  stop(graceMs?: number): void;
}

export interface SpawnAgentOptions {
  sandboxed?: boolean;
}
