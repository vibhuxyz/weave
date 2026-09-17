import type { Message, MessageContent } from "@/shared/types/messages";
import type {
  TranscriptKeepAlivePriority as MeasurementKeepAlivePriority,
  TranscriptLayoutPendingPolicy as MeasurementLayoutPendingPolicy,
  TranscriptMeasurementPolicy as MeasurementPolicy,
  TranscriptMeasurementSafetyReason as MeasurementSafetyReason,
  TranscriptRowKind as MeasurementRowKind,
  TranscriptRowSafetyCapabilities,
} from "../../measurement";

export type TranscriptMeasurementPolicy = MeasurementPolicy;

export type TranscriptLayoutPendingPolicy = MeasurementLayoutPendingPolicy;

export type TranscriptAnchorPriority = "stable" | "streaming" | "none";

export type TranscriptKeepAlivePriority = MeasurementKeepAlivePriority;

export type TranscriptMeasurementSafetyReason = MeasurementSafetyReason;

type RequiredProjectionCapabilityKey =
  | "stateful"
  | "hasMcpApp"
  | "hasHostCalls"
  | "hasActiveTimer"
  | "hasDynamicAsyncLayout"
  | "canOffscreenRenderReal"
  | "canOffscreenRenderShell"
  | "protectsSelection";

export type TranscriptRowCapabilities = Pick<
  TranscriptRowSafetyCapabilities,
  RequiredProjectionCapabilityKey
> &
  Partial<
    Omit<TranscriptRowSafetyCapabilities, RequiredProjectionCapabilityKey>
  >;

export type TranscriptRowKind = MeasurementRowKind;

export type TranscriptDateLabelKey = "today" | "yesterday" | "date";

export interface TranscriptDateSeparatorPayload {
  dateBucket: string;
  timestamp: number;
  labelKey: TranscriptDateLabelKey;
  label: string;
  firstMessageId: string;
}

export interface TranscriptAgentWorkPayload {
  workId: string;
  message: Message;
  content: readonly MessageContent[];
  isActiveWork: boolean;
  /** Whether a final answer row follows this work panel in the transcript. */
  hasFinalAnswer: boolean;
  thoughtCount: number;
  toolCount: number;
  textCount: number;
}

export type TranscriptAssistantContentFragmentRole =
  | "single"
  | "start"
  | "middle"
  | "end";

export interface TranscriptAssistantContentFragmentPayload {
  fragmentId: string;
  fragmentIndex: number;
  fragmentCount: number;
  role: TranscriptAssistantContentFragmentRole;
  content: readonly MessageContent[];
  isStreamingTail: boolean;
  messageScrollTarget: boolean;
  isCodeContinuationChunk: boolean;
  startsWithHeading: boolean;
}

export interface TranscriptRowDescriptor {
  rowId: string;
  reactKey: string;
  kind: TranscriptRowKind;
  messageId?: string;
  responseStartMessageId?: string;
  blockIds?: readonly string[];
  /** Visible blocks for a synthetic message row. */
  messageContent?: readonly MessageContent[];
  /** Related blocks needed to render the visible content without displaying them. */
  messageContentContext?: readonly MessageContent[];
  fragment?: TranscriptAssistantContentFragmentPayload;
  date?: TranscriptDateSeparatorPayload;
  agentWork?: TranscriptAgentWorkPayload;
  renderRevision: string;
  heightRevision: string;
  layoutRevision: string;
  estimatedHeight: number;
  spacingBefore: number;
  anchorPriority: TranscriptAnchorPriority;
  measurementPolicy: TranscriptMeasurementPolicy;
  layoutPendingPolicy: TranscriptLayoutPendingPolicy;
  capabilities: TranscriptRowCapabilities;
  measurementSafetyReasons?: readonly TranscriptMeasurementSafetyReason[];
  keepAlivePriority: TranscriptKeepAlivePriority;
}

export function getTranscriptRowEstimatedHeight(
  row: Pick<TranscriptRowDescriptor, "estimatedHeight" | "spacingBefore">,
): number {
  return Math.max(0, row.estimatedHeight) + Math.max(0, row.spacingBefore);
}
