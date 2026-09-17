import type { ToolCallStatus, ToolKind } from "@agentclientprotocol/sdk";
import type { TurnPersona } from "@/features/chat/hooks";
import type { AgentBlockSchemaVersion, BlockSource } from "./blockBase";
import type { AgentBlock } from "./blocks";
import type { AgentStatus } from "./taskState";

export interface ActivityItem {
  id: string;
  schemaVersion: AgentBlockSchemaVersion;
  source: BlockSource;
  sourceEventIds?: string[];
  sourceSeq?: number;
  label: string;
  status: ToolCallStatus;
  kind: ToolKind;
}

export interface AgentRunMeta {
  provider: "anthropic" | "google" | "openai" | "sourcegraph" | string;
  engine: "claude-code" | "gemini" | "codex" | "amp" | "antigravity" | string;
  engineLabel: string;
  model?: string;
  /** Agents whose instructions were in force for this turn. */
  personas?: TurnPersona[];
  sessionId?: string;
  durationMs?: number;
  filesRead: number;
  filesChanged: number;
  /** Critical/high findings + failed run-log steps in this turn. */
  problemCount?: number;
  /** True when the turn edited files or ran state-mutating commands. */
  changed?: boolean;
  status: AgentStatus;
  usage?: {
    /** Context window: tokens in context, and its size. */
    used?: number;
    size?: number;
    costUsd?: number;
    /** Per-turn totals, when the engine reports them. */
    totalTokens?: number;
    inputTokens?: number;
    outputTokens?: number;
    thoughtTokens?: number;
    cachedReadTokens?: number;
    cachedWriteTokens?: number;
  };
  checkpointId?: string;
}

export interface FileActivity {
  path: string;
  operation: "read" | "written" | "created" | "deleted";
}

export interface GitContext {
  branch: string | null;
  changes: Array<{ path: string; code: string }>;
}

export interface AgentViewModel {
  schemaVersion: 1;
  id: string;
  role: "assistant";
  blocks: AgentBlock[];
  activity: ActivityItem[];
  files: FileActivity[];
  git?: GitContext;
  status: AgentStatus;
  meta: AgentRunMeta;
  sourceEventIds: string[];
  rawText: string;
}
