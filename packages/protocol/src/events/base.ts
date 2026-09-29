export type EventSeq = number;

export interface BaseEvent {
  runId: string;
  seq: EventSeq;
  at: string;
  taskId?: string;
}
