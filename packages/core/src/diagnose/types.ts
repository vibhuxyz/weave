export interface RungTiming {
  readonly rung: string;
  readonly ok: boolean;
  readonly wallMs: number;
}

export interface TaskError {
  readonly where: string;
  readonly message: string;
}

export interface TaskTimeout {
  readonly reason: string;
  readonly turns: number;
  readonly wallMs: number;
}

export interface TaskDiagnosis {
  readonly taskId: string;
  readonly status: string;
  readonly reason: string | null;
  readonly attempts: number;
  readonly engines: readonly string[];
  readonly installMs: number;
  readonly agentMs: number;
  readonly wallMs: number;
  readonly toolCalls: number;
  readonly filesWritten: number;
  readonly costUsd: number;
  readonly verifications: readonly RungTiming[];
  readonly timeouts: readonly TaskTimeout[];
  readonly errors: readonly TaskError[];
}

export interface RunDiagnosis {
  readonly runId: string;
  readonly wallMs: number;
  readonly status: string;
  readonly tasks: readonly TaskDiagnosis[];
  readonly failed: readonly TaskDiagnosis[];
  readonly slowest: readonly TaskDiagnosis[];
  readonly runErrors: readonly TaskError[];
  readonly costUsd: number;
  readonly eventCount: number;
}
