export interface HistoryArchive {
  readonly version: number;
  readonly sessionId: string;
  readonly turns: readonly unknown[];
  readonly droppedTurnCount: number;
}

export type ParseResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };
