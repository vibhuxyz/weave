import type { ToolCallStatus, ToolKind } from "@agentclientprotocol/sdk";
import type { GitStatus } from "../../../server/index.ts";
import type { ToolEntry } from "../../useAcpChat";

export type AgentBlockSchemaVersion = 1;

export interface AgentBlockBase {
  id: string;
  schemaVersion: AgentBlockSchemaVersion;
  sourceEventIds?: string[];
  sourceSeq?: number;
}

export interface SummaryBlock extends AgentBlockBase {
  type: "summary";
  label?: string;
  text: string;
}

export interface MarkdownBlock extends AgentBlockBase {
  type: "markdown";
  text: string;
}

export interface ConstantItem {
  name: string;
  value: string;
  description?: string;
}

export interface ExplanationBlock extends AgentBlockBase {
  type: "explanation";
  oneLine: string;
  sections: Array<
    | {
        type: "text";
        title: string;
        content: string;
      }
    | {
        type: "constants";
        title: string;
        items: ConstantItem[];
      }
    | {
        type: "code";
        title: string;
        file: string;
        startLine?: number;
        endLine?: number;
        code: string;
        language?: string;
      }
    | {
        type: "math";
        title: string;
        content: string;
      }
  >;
}

export interface ToolStepBlock extends AgentBlockBase {
  type: "tool";
  tool: ToolEntry;
}

export type FindingSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface EvidenceRow {
  label: string;
  value: string;
  status?: "ok" | "failed" | "warning" | "neutral";
}

export interface FindingBlock extends AgentBlockBase {
  type: "finding";
  severity: FindingSeverity;
  title: string;
  body: string;
  location?: {
    file: string;
    line?: number;
  };
  verified?: boolean;
  evidence: EvidenceRow[];
  actions?: string[];
}

export interface CodeBlock extends AgentBlockBase {
  type: "code";
  title?: string;
  file?: string;
  language?: string;
  code: string;
}

export interface DiffBlock extends AgentBlockBase {
  type: "diff";
  file?: string;
  diff: string;
}

export interface TestRunBlock extends AgentBlockBase {
  type: "test";
  title: string;
  status: "running" | "passed" | "failed";
  durationMs?: number;
  steps: Array<{
    id: string;
    label: string;
    status: ToolCallStatus;
    kind: ToolKind;
    durationMs?: number;
  }>;
  findings: number;
}

export interface ErrorBlock extends AgentBlockBase {
  type: "error";
  message: string;
}

export interface PermissionBlock extends AgentBlockBase {
  type: "permission";
  title: string;
  decision?: "allow" | "reject";
  reason?: string;
}

export interface FileChangeBlock extends AgentBlockBase {
  type: "file-change";
  files: Array<{ path: string; status: string }>;
}

export interface SafetyAskBlock extends AgentBlockBase {
  type: "safety-ask";
  title: string;
  body: string;
  concerns: Array<{
    title: string;
    tag: string;
    evidence?: string;
  }>;
  choices: string[];
}

export type AgentBlock =
  | SummaryBlock
  | ExplanationBlock
  | MarkdownBlock
  | ToolStepBlock
  | FindingBlock
  | CodeBlock
  | DiffBlock
  | TestRunBlock
  | ErrorBlock
  | PermissionBlock
  | FileChangeBlock
  | SafetyAskBlock;

export interface ActivityItem {
  id: string;
  schemaVersion: AgentBlockSchemaVersion;
  sourceEventIds?: string[];
  sourceSeq?: number;
  label: string;
  status: ToolCallStatus;
  kind: ToolKind;
}

export interface AgentRunMeta {
  engine: "claude-code" | "codex" | "gemini" | "amp" | string;
  engineLabel: string;
  model?: string;
  durationMs?: number;
  filesRead: number;
  filesChanged: number;
  status: "running" | "completed" | "failed";
  usage?: {
    used?: number;
    size?: number;
    costUsd?: number;
  };
}

export interface AgentViewModel {
  schemaVersion: AgentBlockSchemaVersion;
  id: string;
  role: "assistant";
  blocks: AgentBlock[];
  activity: ActivityItem[];
  meta: AgentRunMeta;
  rawText: string;
}

export interface NormalizeContext {
  projectDir: string | null;
  git: GitStatus;
  status: AgentRunMeta["status"];
  configValues: Record<string, string>;
}

