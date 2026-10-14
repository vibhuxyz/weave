export type TurnOutcome = "completed" | "unfinished" | "cancelled" | "error";

export interface TurnFacts {
  readonly files: readonly string[];
  readonly fileCount: number;
  readonly commands: readonly string[];
  readonly failures: readonly string[];
}

export interface CapturedTurn {
  readonly answerText: string;
  readonly facts: TurnFacts;
}

export interface ThreadTurn extends CapturedTurn {
  readonly seq: number;
  readonly engineId: string;
  readonly userText: string;
  readonly outcome: TurnOutcome;
}

export interface WorkspaceSnapshot {
  readonly branch: string | null;
  readonly changes: readonly { readonly code: string; readonly path: string }[];
}

export interface PreparedHandoff {
  readonly preamble: string | null;
  readonly isResumed: boolean;
  readonly turnsHandedOff: number;
  readonly bytes: number;
}
