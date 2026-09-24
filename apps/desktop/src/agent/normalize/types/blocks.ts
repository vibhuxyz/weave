import type { ToolCallStatus, ToolKind } from "@agentclientprotocol/sdk";
import type { ToolEntry } from "@/features/chat/hooks";
import type { CheckpointReason } from "@weave/protocol";
import type { AgentBlockBase } from "./blockBase";

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
    | { type: "text"; title: string; content: string }
    | { type: "constants"; title: string; items: ConstantItem[] }
    | { type: "code"; title: string; file: string; startLine?: number; endLine?: number; code: string; language?: string }
    | { type: "math"; title: string; content: string }
  >;
}

export interface ToolStepBlock extends AgentBlockBase {
  type: "tool";
  tool: ToolEntry;
}

export type FindingSeverity = "critical" | "high" | "medium" | "low" | "info";
export type FindingStatus = "discovered" | "verifying" | "verified" | "unverified" | "false_positive";

export interface EvidenceRow {
  label: string;
  value: string;
  status?: "ok" | "failed" | "warning" | "neutral";
}

export interface FindingBlock extends AgentBlockBase {
  type: "finding";
  severity: FindingSeverity;
  findingStatus?: FindingStatus;
  title: string;
  body: string;
  location?: { file: string; line?: number };
  verified?: boolean;
  evidence: EvidenceRow[];
  /** First fenced code block found in the finding body, rendered as a panel. */
  evidenceCode?: { language?: string; code: string };
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

export type StepStatus = "queued" | "running" | "passed" | "failed" | "cancelled" | "timeout";

export interface TestRunBlock extends AgentBlockBase {
  type: "test";
  title: string;
  /** `recovered`: something failed, and a later run of the same kind passed.
   * `completed`: every command succeeded, but none of them ran tests, so nothing "passed". */
  status: "running" | "passed" | "completed" | "failed" | "recovered";
  durationMs?: number;
  steps: Array<{
    id: string;
    label: string;
    status: ToolCallStatus;
    kind: ToolKind;
    durationMs?: number;
    /** Semantic result label parsed from output, e.g. "500 crash", "201 created". */
    badge?: string;
    badgeTone?: "crit" | "ok" | "warn" | "neutral";
    /** This failure was answered by a later passing run, so it needs no action. */
    superseded?: boolean;
    /** Raw command output, when captured. */
    output?: string;
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
  actuallyIs?: string;
  actionSubtitle?: string;
  concerns: Array<{ title: string; tag: string; evidence?: string }>;
  choices: string[];
}

// EvidenceBlock — promoted to first-class block (§8)
export type EvidenceKind = "text" | "code" | "http" | "command" | "file" | "diff" | "json" | "table";

export interface EvidenceBlock extends AgentBlockBase {
  type: "evidence";
  kind: EvidenceKind;
  title?: string;
  content: string;
  sourceEventIds: string[];
  expandable: boolean;
  truncated?: boolean;
  fullOutputRef?: string;
}

// CheckpointBlock — handoff/interrupt/resume UI (§9)
export interface CheckpointBlock extends AgentBlockBase {
  type: "checkpoint";
  mode: "resume" | "handoff" | "retry";
  reason: CheckpointReason;
  checkpointId: string;
  summary: {
    filesModified: number;
    commandsExecuted: number;
    testsPassed: number;
    testsFailed: number;
    notes: string[];
  };
  /**
   * Not `capabilities.handoff`-filtered: those are declarations, not
   * measurements (CONTINUATION.md §11 — "offering something unproven" until
   * the eval matrix in Slice 7 turns them into facts). V1.2 offers every
   * other installed engine and leaves the choice manual.
   */
  availableEngines: { id: string; label: string }[];
}

export interface ProjectOverviewBlock extends AgentBlockBase {
  type: "project-overview";
  title: string;
  description: string;
  /** A rendered directory tree, if the response contained one. */
  tree?: string;
  sections: Array<{ icon?: string; title: string; content: string }>;
}

export interface PlanBlockEntry {
  id: string;
  content: string;
  priority?: "high" | "medium" | "low";
  status?: "pending" | "in_progress" | "completed";
}

export interface PlanBlock extends AgentBlockBase {
  type: "plan";
  title?: string;
  entries: PlanBlockEntry[];
  approved?: boolean;
  turnId?: string;
  /**
   * The agent has finished planning and is blocked on the user (Claude Code
   * plan mode / an `ExitPlanMode` tool call). The UI opens the approval modal
   * automatically for these; a live todo-list plan leaves it false.
   */
  awaitingApproval?: boolean;
  /**
   * The plan as the agent wrote it — full markdown, headings and prose intact.
   * Present for `ExitPlanMode`-style plans; the modal renders and edits this
   * verbatim rather than the fragmented `entries`. Todo-list plans have none.
   */
  markdown?: string;
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
  | SafetyAskBlock
  | EvidenceBlock
  | CheckpointBlock
  | ProjectOverviewBlock
  | PlanBlock;
