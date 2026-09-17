export type AgentBlockSchemaVersion = 1;

export interface BlockSource {
  eventIds: string[];
  seqStart?: number;
  seqEnd?: number;
}

export interface AgentBlockBase {
  id: string;
  schemaVersion: AgentBlockSchemaVersion;
  source: BlockSource;
  /** @deprecated use source.eventIds */
  sourceEventIds?: string[];
  /** @deprecated use source.seqStart */
  sourceSeq?: number;
}

export function emptySource(eventIds?: string[], seqStart?: number): BlockSource {
  return { eventIds: eventIds ?? [], seqStart, seqEnd: seqStart };
}
