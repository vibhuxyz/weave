import type { ToolCallStatus, ToolKind } from "@agentclientprotocol/sdk";
import type { ConversationMeta } from "../../../../../server/index.ts";
import type { CheckpointReason } from "@weave/protocol";
import type { CompactionNotice } from "@/features/chat/compaction";

export type { ConversationMeta };

/** One file edit an ACP tool reported, as `{ type: "diff" }` content. */
export interface ToolDiff {
  path: string;
  /** `null` when the file was created by this edit. */
  oldText: string | null;
  newText: string;
  /**
   * 1-based line in the file where `oldText` starts, for engines that report a
   * region rather than the whole file. Absent means the texts are whole files.
   */
  startLine?: number;
}

export interface ToolEntry {
  id: string;
  title: string;
  status: ToolCallStatus;
  /** read | edit | delete | move | search | execute | think | fetch | … */
  kind: ToolKind;
  /** Terminal / tool output text, accumulated from `content` on each update. */
  output?: string;
  /** The tool's raw arguments (e.g. `{ command }`, `{ plan }`, `{ content }`). */
  rawInput?: unknown;
  /** Weave's policy refused this without asking, e.g. plan mode. */
  blockedReason?: string;
  /** File edits this call reported, newest snapshot wins. */
  diffs?: ToolDiff[];
  /** Epoch ms when the call first appeared, and when it finished. For timers. */
  startedAt?: number;
  endedAt?: number;
  /**
   * The turn ended while this call was still `pending`/`in_progress` — a Stop,
   * a dropped connection, or an engine that never sent a terminal update. The
   * ACP status stays as reported; this says the call will never resolve, so
   * the spinner, the live timer and Stop must not keep running.
   */
  interrupted?: boolean;
  sourceEventIds?: string[];
  sourceSeq?: number;
}

/** An image attached to a prompt, with the per-image fix/build instructions. */
export interface ChatImageAttachment {
  previewUrl: string;
  mimeType: string;
  prompt: string;
  /** Where the engine saved it. Set on replay, where there is no blob URL. */
  path?: string;
  /** The file is gone or unreadable — show the missing state, not a spinner. */
  unavailable?: boolean;
}

export interface PlanItem {
  id: string;
  content: string;
  priority?: "high" | "medium" | "low";
  status?: "pending" | "in_progress" | "completed";
}

export interface TurnPlan {
  entries: PlanItem[];
  approved?: boolean;
}

/**
 * Token accounting for one assistant turn. `contextUsed`/`contextSize` come from
 * the running ACP `usage_update` (context window); `inputTokens`/`outputTokens`/
 * `thoughtTokens` land once from the `PromptResponse` on `turn-end`. Every field
 * is optional — not every engine reports any of this.
 */
export interface TurnUsage {
  contextUsed?: number;
  contextSize?: number;
  costUsd?: number;
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  thoughtTokens?: number;
  cachedReadTokens?: number;
  cachedWriteTokens?: number;
}

/** An agent whose instructions were in force for a turn. */
export interface TurnPersona {
  id: string;
  name: string;
  /** Custom avatar data-URI; absent means the character art keyed off `id`. */
  icon?: string;
  /** A bundled character the user picked for this agent. */
  character?: string;
}

/** A Stop-sequence checkpoint (CONTINUATION.md §8) attached to the turn it
 * interrupted, so `messageToBlocks` can render the CheckpointBlock. */
export interface TurnCheckpoint {
  checkpointId: string;
  reason: CheckpointReason;
  summary: {
    filesModified: number;
    commandsExecuted: number;
    testsPassed: number;
    testsFailed: number;
    notes: string[];
  };
}

export interface ChatTurn {
  id: string;
  role: "user" | "assistant" | "notice";
  text: string;
  compaction?: CompactionNotice;
  historyGap?: number;
  checkpoint?: TurnCheckpoint;
  /** Names of agents @-mentioned on this prompt, for the pills on the bubble. */
  mentions?: string[];
  /**
   * Agents active for this turn — standing plus @-mentioned. Carried on both
   * halves of the exchange so the run card can say who answered.
   */
  personas?: TurnPersona[];
  images?: ChatImageAttachment[];
  /** The agent's reasoning stream (`agent_thought_chunk`), shown collapsed. */
  thought: string;
  tools: ToolEntry[];
  plan?: TurnPlan;
  /** Token usage for this turn, as far as the engine has reported it. */
  usage?: TurnUsage;
  sourceEventIds?: string[];
  sourceSeq?: number;
}

export type ConnectionState =
  | "idle"
  | "connecting"
  | "ready"
  | "closed"
  | "error";
