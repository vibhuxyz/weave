import type { TaskContract } from "@weave/protocol";
import type { AgentSession, SessionSink } from "../session/index.ts";
import type { PermissionPolicy } from "../permissions/index.ts";

export interface EngineSupervisor {
  readonly current: AgentSession;
  readonly currentEngineId: string;
  /**
   * The current session, replaced by a fresh engine when the old one was
   * stopped (stall watchdog, crash). Call before every turn.
   */
  reviveCurrent(): Promise<AgentSession>;
  switchTo(engineId: string): Promise<AgentSession>;
  killAll(): void;
}

export interface WarmEngine {
  session: AgentSession;
  idleTimer?: ReturnType<typeof setTimeout>;
}

export interface CreateSupervisorOptions {
  task: TaskContract;
  sink: SessionSink;
  policy?: PermissionPolicy;
  engineId?: string;
  resumeSessionId?: string | null;
  idleGraceMs?: number;
  sandboxed?: boolean;
  /** Silence allowed during a turn before the engine is killed. 0 disables. */
  stallTimeoutMs?: number;
}
