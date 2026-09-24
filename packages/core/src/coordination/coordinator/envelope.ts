import { COORDINATION_EVENT_VERSION, type CoordinationDraft, type CoordinationEvent } from "@weave/protocol";

export interface EnvelopeMeta {
  readonly id: string;
  readonly from: string;
  readonly seq: number;
  readonly occurredAt: string;
  readonly correlationId: string;
}

export function buildEvent(draft: CoordinationDraft, meta: EnvelopeMeta): CoordinationEvent {
  return { ...draft, ...meta, version: COORDINATION_EVENT_VERSION };
}
