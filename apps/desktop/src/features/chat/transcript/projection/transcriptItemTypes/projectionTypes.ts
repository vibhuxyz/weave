import type { Message, ToolCallLocation, ToolKind } from "@/shared/types/messages";
import type { TranscriptItemDescriptor } from "./itemTypes";
import type { TranscriptRowDescriptor } from "./rowTypes";

export interface TranscriptArtifactDescriptor {
  artifactKey: string;
  sessionId: string;
  rowId: string;
  messageId: string;
  blockId: string;
  toolRequestId: string;
  toolName: string;
  toolKind?: ToolKind;
  location: ToolCallLocation & { path: string };
  locationRevision: string;
  path: string;
  line?: number | null;
  messageCreated: number;
}

export interface TranscriptArtifactIndex {
  artifacts: readonly TranscriptArtifactDescriptor[];
  artifactByKey: ReadonlyMap<string, TranscriptArtifactDescriptor>;
  artifactKeysByMessageId: ReadonlyMap<string, readonly string[]>;
  artifactKeysByToolRequestId: ReadonlyMap<string, readonly string[]>;
  artifactKeysByRowId: ReadonlyMap<string, readonly string[]>;
  changedArtifactKeys: ReadonlySet<string>;
}

export interface TranscriptProjectionSnapshot {
  sessionId: string;
  sessionEpoch: number;
  items: readonly TranscriptItemDescriptor[];
  rows: readonly TranscriptRowDescriptor[];
  rowByMessageId: ReadonlyMap<string, string>;
  rowIndexById: ReadonlyMap<string, number>;
  messageById: ReadonlyMap<string, Message>;
  searchableTextByMessageId: ReadonlyMap<string, string>;
  artifactIndex: TranscriptArtifactIndex;
  changedRowIds: ReadonlySet<string>;
  descriptorChurn: number;
  fragmentRowCount: number;
  completedFragmentRowCount: number;
  completedStreamingFragmentRowCount: number;
  streamingTailRowCount: number;
  wholeMessageFallbackRowCount: number;
  reusedPrefixCount: number;
  reusedSuffixCount: number;
  projectionDurationMs: number;
}

export interface TranscriptProjectionCacheUpdateInput {
  sessionId: string;
  sessionEpoch: number;
  messages: readonly Message[];
  streamingMessageId: string | null;
  nowBucket: string;
  localeKey: string;
  previous?: TranscriptProjectionSnapshot;
}

export interface TranscriptProjectionCache {
  update(
    input: TranscriptProjectionCacheUpdateInput,
  ): TranscriptProjectionSnapshot;
  promoteSession(oldSessionId: string, newSessionId: string): void;
  cleanupSession(sessionId: string): void;
  cancelPendingWork(sessionId: string, sessionEpoch: number): void;
  invalidateCalendarLabels(nowBucket: string, localeKey: string): void;
}
