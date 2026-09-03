import type { ToolCallStatus, ToolKind } from "@agentclientprotocol/sdk";
import type { GitStatus } from "../../../server/index.ts";
import type { ToolEntry } from "../../useAcpChat";
import type { EngineDescriptor } from "@weave/agent/engines-registry.ts";

export type AgentBlockSchemaVersion = 1;

// ---------------------------------------------------------------------------
// Block provenance — every block must know its source
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// AgentStatus
// ---------------------------------------------------------------------------

export type AgentStatus =
  | "idle"
  | "running"
  | "waiting_permission"
  | "waiting_user"
  | "completed"
  | "failed"
  | "interrupted"
  | "cancelled"
  | "provider_limit"; // triggers CheckpointBlock / handoff UI

// ---------------------------------------------------------------------------
// TaskState — authoritative execution state (NOT the UI model)
// ---------------------------------------------------------------------------

export type TaskStatus =
  | "idle"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "interrupted"
  | "cancelled"
  | "provider_limit";

export interface CommandResult {
  command: string;
  exitCode: number;
  stdout?: string;
  stderr?: string;
  durationMs?: number;
}

export interface VerificationResult {
  kind: "typecheck" | "lint" | "test" | "build" | "custom";
  status: "passed" | "failed" | "skipped";
  summary: string;
}

export interface Decision {
  description: string;
  rationale?: string;
  timestamp: string;
}

export interface ErrorRecord {
  message: string;
  eventId?: string;
  timestamp: string;
  fatal: boolean;
}

export interface TaskState {
  schemaVersion: 1;
  taskId: string;
  runId: string;
  objective: string;
  status: TaskStatus;
  completed: string[];
  inProgress?: {
    description: string;
    lastStep?: string;
  };
  remaining: string[];
  files: {
    read: string[];
    modified: string[];
    created: string[];
    deleted: string[];
  };
  commands: CommandResult[];
  verification: VerificationResult[];
  decisions: Decision[];
  errors: ErrorRecord[];
  lastCheckpointId?: string;
}

// ---------------------------------------------------------------------------
// HandoffContext — what gets sent to the next engine
// ---------------------------------------------------------------------------

export interface HandoffContext {
  schemaVersion: 1;
  taskId: string;
  runId: string;
  originalRequest: string;
  objective: string;
  previousEngine: {
    provider: string;
    engine: string;
    model?: string;
  };
  interruption: {
    reason: string;
  };
  completed: string[];
  inProgress?: string;
  remaining: string[];
  modifiedFiles: string[];
  relevantCommands: CommandResult[];
  verification: VerificationResult[];
  importantDecisions: Decision[];
  lastKnownState: string;
  checkpointId: string;
}

// ---------------------------------------------------------------------------
// Event cursor — idempotency for WebSocket replay
// ---------------------------------------------------------------------------

export interface EventCursor {
  lastSeq: number;
  processedEventIds: Set<string>;
}

// ---------------------------------------------------------------------------
// Block types
// ---------------------------------------------------------------------------

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
  status: "running" | "passed" | "failed";
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
  reason: "provider_limit" | "user_cancelled" | "error" | "max_turns" | "explicit_handoff";
  checkpointId: string;
  summary: {
    filesModified: number;
    commandsExecuted: number;
    testsPassed: number;
    testsFailed: number;
    notes: string[];
  };
  availableEngines: EngineDescriptor[];
}

export interface ProjectOverviewBlock extends AgentBlockBase {
  type: "project-overview";
  title: string;
  description: string;
  /** A rendered directory tree, if the response contained one. */
  tree?: string;
  sections: Array<{ icon?: string; title: string; content: string }>;
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
  | ProjectOverviewBlock;

// ---------------------------------------------------------------------------
// Activity + ViewModel
// ---------------------------------------------------------------------------

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
    used?: number;
    size?: number;
    costUsd?: number;
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

// ---------------------------------------------------------------------------
// Declarative action contracts (§12)
// ---------------------------------------------------------------------------

export type BlockAction =
  | { type: "open_file"; file: string; line?: number }          // filesystem file
  | { type: "open_output"; outputRef: string }                  // ledger output artifact
  | { type: "view_evidence"; evidenceId: string }
  | { type: "rerun"; testId: string }
  | { type: "send_message"; text: string }
  | { type: "apply_fix"; findingId: string }
  | { type: "continue_with_engine"; engineId: string; checkpointId: string }
  | { type: "cancel_run" }
  | { type: "resume_run"; checkpointId: string };

// ---------------------------------------------------------------------------
// Normalize context
// ---------------------------------------------------------------------------

export interface NormalizeContext {
  projectDir: string | null;
  git: GitStatus;
  status: AgentStatus;
  configValues: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Helper: build an empty BlockSource
// ---------------------------------------------------------------------------

export function emptySource(eventIds?: string[], seqStart?: number): BlockSource {
  return { eventIds: eventIds ?? [], seqStart, seqEnd: seqStart };
}
