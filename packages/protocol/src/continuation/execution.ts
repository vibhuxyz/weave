export type ExecutionPhase =
  | "planning"
  | "exploring"
  | "executing"
  | "verifying"
  | "finalizing"
  | "completed"
  | "blocked"
  | "failed";

export type TurnStatus = "active" | "completed" | "interrupted" | "failed";
export type TaskExecutionStatus = "in_progress" | "blocked" | "completed" | "failed";
export type AnswerStatus = "pending" | "partial" | "final";

export interface ExecutionProgress {
  turnStatus: TurnStatus;
  taskStatus: TaskExecutionStatus;
  answerStatus: AnswerStatus;
  usedTools: boolean;
  hasUserFacingText: boolean;
  hasFinalAnswer: boolean;
  toolCallsCount: number;
  stopReason?: string;
}

export type RecoveryReason =
  | "turn_ended_without_final"
  | "turn_budget_exhausted"
  | "provider_error"
  | "finalization_failed";

export type RecoveryAction =
  | "resume"
  | "replan"
  | "finalize"
  | "handoff"
  | "escalate";

export interface RecoveryDecision {
  workSessionId: string;
  attempt: number;
  reason: RecoveryReason;
  phase: ExecutionPhase;
  action: RecoveryAction;
  checkpointId?: string;
}
