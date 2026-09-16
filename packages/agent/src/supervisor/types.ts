import type { TaskContract } from "@weave/protocol";
import type { AgentSession, SessionSink } from "../session/index.ts";
import type { PermissionPolicy } from "../permissions/index.ts";

export interface EngineSupervisor {
  readonly current: AgentSession;
  readonly currentEngineId: string;
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
}
