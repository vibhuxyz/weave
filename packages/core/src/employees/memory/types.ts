export type MemoryKind = "outcome" | "failure" | "decision" | "discovery";

export interface MemoryEntry {
  readonly at: string;
  readonly runId: string;
  readonly taskId: string;
  readonly kind: MemoryKind;
  readonly text: string;
}

export interface MemoryRead {
  readonly entries: readonly MemoryEntry[];
  readonly skippedLines: number;
  readonly issue: string | null;
}
