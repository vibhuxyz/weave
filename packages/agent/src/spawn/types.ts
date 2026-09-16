import type { ChildProcess } from "node:child_process";
import type { EngineDescriptor } from "../engines/index.ts";

export interface SpawnedAgent {
  child: ChildProcess;
  engine: EngineDescriptor;
  entry: string;
  stop(graceMs?: number): void;
}

export interface SpawnAgentOptions {
  sandboxed?: boolean;
}
