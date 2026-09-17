import type { Message, MessageContent } from "@/shared/types/messages";
import type {
  TranscriptAnchorPriority,
  TranscriptAssistantContentFragmentPayload,
  TranscriptDateSeparatorPayload,
  TranscriptKeepAlivePriority,
  TranscriptLayoutPendingPolicy,
  TranscriptMeasurementPolicy,
  TranscriptMeasurementSafetyReason,
  TranscriptRowCapabilities,
} from "./rowTypes";

export interface TranscriptDateSeparatorItem {
  itemId: string;
  kind: "date-separator";
  rowId: string;
  payload: TranscriptDateSeparatorPayload;
  renderRevision: string;
  heightRevision: string;
  estimatedHeight: number;
}

export interface TranscriptMessageItem {
  itemId: string;
  kind: "message";
  rowId: string;
  messageId: string;
  responseStartMessageId?: string;
  message: Message;
  visibleContent: readonly MessageContent[];
  blockIds: readonly string[];
  searchableText: string;
  isStreaming: boolean;
  renderRevision: string;
  heightRevision: string;
  estimatedHeight: number;
  capabilities: TranscriptRowCapabilities;
  measurementPolicy: TranscriptMeasurementPolicy;
  layoutPendingPolicy: TranscriptLayoutPendingPolicy;
  measurementSafetyReasons: readonly TranscriptMeasurementSafetyReason[];
  anchorPriority: TranscriptAnchorPriority;
  keepAlivePriority: TranscriptKeepAlivePriority;
}

export interface TranscriptAssistantContentFragmentItem {
  itemId: string;
  kind: "assistant-content-fragment";
  rowId: string;
  messageId: string;
  message: Message;
  visibleContent: readonly MessageContent[];
  blockIds: readonly string[];
  searchableText: string;
  fragment: TranscriptAssistantContentFragmentPayload;
  renderRevision: string;
  heightRevision: string;
  estimatedHeight: number;
  capabilities: TranscriptRowCapabilities;
  measurementPolicy: TranscriptMeasurementPolicy;
  layoutPendingPolicy: TranscriptLayoutPendingPolicy;
  measurementSafetyReasons: readonly TranscriptMeasurementSafetyReason[];
  anchorPriority: TranscriptAnchorPriority;
  keepAlivePriority: TranscriptKeepAlivePriority;
}

export interface TranscriptAgentWorkItem {
  itemId: string;
  kind: "agent-work";
  rowId: string;
  messageId: string;
  message: Message;
  workId: string;
  content: readonly MessageContent[];
  isActiveWork: boolean;
  hasFinalAnswer: boolean;
  thoughtCount: number;
  toolCount: number;
  textCount: number;
  renderRevision: string;
  heightRevision: string;
  estimatedHeight: number;
  capabilities: TranscriptRowCapabilities;
  measurementPolicy: TranscriptMeasurementPolicy;
  layoutPendingPolicy: TranscriptLayoutPendingPolicy;
  measurementSafetyReasons: readonly TranscriptMeasurementSafetyReason[];
  anchorPriority: TranscriptAnchorPriority;
  keepAlivePriority: TranscriptKeepAlivePriority;
}

export type TranscriptItemDescriptor =
  | TranscriptDateSeparatorItem
  | TranscriptMessageItem
  | TranscriptAssistantContentFragmentItem
  | TranscriptAgentWorkItem;
