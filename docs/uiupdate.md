# UI Architecture & Implementation Guide — Agent Response Cards

> Reference screenshots: `/Users/vibhu/Downloads/ui/` (2026-09-03)  
> Last updated: 2026-09-03

---

## 1. Architecture Overview

### Source-of-Truth Hierarchy

```
                    SOURCE OF TRUTH
                          │
                    Ledger / Runtime
                          │
            ┌─────────────┼─────────────┐
            ▼             ▼             ▼
        TaskState     FileSystem      Git
            │
            ▼
      HandoffContext

Ledger / Runtime
       ↓
AgentViewModel
       ↓
React UI
```

**Critical rule:** Model text never overrides authoritative runtime state. If Claude says "I modified `auth.ts`" but no `file.written` event exists in the ledger, the Files tab does **not** show `auth.ts` as modified.

### Full Execution Data Flow

```
Raw ACP Events / Ledger
        ↓
  TaskState Reducer        (reduceEvent.ts — single authoritative execution state)
        ↓
  TaskState                (what the execution system needs — see §2)
        ↓
  Checkpoint               (immutable snapshot at milestone events — see §3)
        ↓
  HandoffContext           (serialized context sent to next engine — see §4)
        ↓
  New Agent (Gemini / Codex)
```

### UI Rendering Data Flow

```
Raw ACP Events / Ledger
        ↓
  Event Normalizer         (eventReducer.ts — converts events to ViewModel incrementally)
        ↓
  AgentViewModel           (what the UI needs — see §5)
        ↓
  AgentMessage             (root React component — reads ViewModel, never interprets raw ACP)
        ↓
  Block Renderer           (dispatches each AgentBlock to its component)
        ↓
  React UI
```

**Key distinction:**
- `TaskState` = what the **execution system** needs (task tracking, checkpointing, handoff)
- `AgentViewModel` = what the **UI** needs (blocks, tabs, display metadata)

These are different structures. Do not conflate them.

**Rule:** `AgentMessage` must never interpret raw ACP data. It reads only the `AgentViewModel`. All ACP interpretation lives in the normalizer.

---

## 2. TaskState — Authoritative Execution State

`TaskState` is what the execution system tracks — it is **not** the UI model. It is produced by a pure reducer over ledger events and represents everything needed to checkpoint, resume, or hand off a task.

```ts
type TaskStatus =
  | "idle"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "interrupted"
  | "cancelled"
  | "provider_limit";

type CommandResult = {
  command: string;
  exitCode: number;
  stdout?: string;
  stderr?: string;
  durationMs?: number;
};

type VerificationResult = {
  kind: "typecheck" | "lint" | "test" | "build" | "custom";
  status: "passed" | "failed" | "skipped";
  summary: string;
};

type Decision = {
  description: string;
  rationale?: string;
  timestamp: string;
};

type ErrorRecord = {
  message: string;
  eventId?: string;
  timestamp: string;
  fatal: boolean;
};

type TaskState = {
  schemaVersion: 1;

  taskId: string;
  runId: string;

  objective: string;

  status: TaskStatus;

  completed: string[];         // steps that are done

  inProgress?: {
    description: string;
    lastStep?: string;
  };

  remaining: string[];         // steps still to do

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
};
```

### TaskState Reducer

```ts
// reduceEvent.ts
function reduceEvent(state: TaskState, event: NormalizedEvent): TaskState {
  // Pure function — state machine over ledger events
  // Returns new state, never mutates
}
```

This is the single authoritative reducer. All execution system code reads `TaskState`, not raw events.

---

## 3. Checkpoint Semantics — Immutable Snapshots

### When to Create a Checkpoint

Checkpoints are **immutable** — once written, never modified. Each checkpoint gets a unique sequential ID:

```
checkpoint-181.json    ← immutable
checkpoint-184.json    ← immutable
checkpoint-192.json    ← immutable
```

This creates a proper execution timeline:

```
Claude
 ↓
Checkpoint 184
 ↓
Gemini
 ↓
Checkpoint 192
```

### Automatic Checkpoint Triggers

A checkpoint is always created on:

| Event | Trigger |
|---|---|
| `provider_limit` | Agent hits monthly/daily limit |
| `agent_crash` | Unexpected agent termination |
| `timeout` | Task exceeds time budget |
| `user_cancellation` | User presses Stop |
| `max_turns` | Turn limit reached |
| `explicit_handoff` | User requests engine switch |

### Periodic / Milestone Checkpoints (Optional)

For long-running tasks, consider checkpointing after important milestones:

| Milestone | Checkpoint? |
|---|---|
| `file.written` | ✅ Yes — state has changed |
| `verification passed` | ✅ Yes — important milestone |
| `test completed` | ✅ Yes — progress marker |
| `agent.message chunk` | ❌ No — streaming tokens, not state |
| `tool_call pending` | ❌ No — in-flight, not settled |

**Rule:** Do not checkpoint every streaming token. Checkpoint only when execution state has durably changed.

---

## 4. HandoffContext — What Gets Sent to the Next Engine

`HandoffContext` is the serialized object passed to Gemini / Codex when resuming from a checkpoint. It is derived from `TaskState`.

```ts
type HandoffContext = {
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

  lastKnownState: string;   // human-readable summary of where execution stopped

  checkpointId: string;
};
```

### Handoff Flow

```
TaskState
    ↓
buildHandoffContext(taskState, checkpointId)
    ↓
HandoffContext
    ↓
serialize to checkpoint-{id}.json
    ↓
New engine reads HandoffContext
    ↓
Verify workspace (git status + diff + modified files)
    ↓
Compare with checkpoint — do NOT blindly trust summary
    ↓
Continue task
```

**Critical:** The receiving engine must verify the actual workspace state against the `HandoffContext`. It cannot blindly trust Claude's summary — the filesystem is authoritative.

---

## 5. AgentViewModel — Full Type Definition

```ts
type AgentViewModel = {
  schemaVersion: 1;

  id: string;

  // Provider + engine identity — independent from UI branding
  meta: AgentRunMeta;

  // Presentation blocks for the Overview tab
  blocks: AgentBlock[];

  // All tool calls, in order (for Activity tab)
  activity: ActivityItem[];

  // Authoritative file read/write log (from ledger, not model text)
  files: FileActivity[];

  // Git context from actual git status/diff
  git?: GitContext;

  // Current execution state
  status: AgentStatus;

  // ACP event IDs that produced this ViewModel (for provenance)
  sourceEventIds: string[];
};
```

### AgentRunMeta

```ts
type AgentRunMeta = {
  // Separate provider, engine, and model — all independent
  provider: "anthropic" | "google" | "openai" | "sourcegraph" | string;
  engine: "claude-code" | "gemini" | "codex" | "amp" | "antigravity" | string;
  engineLabel: string;               // "Claude Code", "Gemini CLI", etc.
  model?: string;                    // "claude-sonnet-4-5", "gemini-2.5-pro", etc.
  sessionId?: string;
  durationMs?: number;
  filesRead: number;
  filesChanged: number;
  status: AgentStatus;
  usage?: {
    used?: number;                   // context tokens used
    size?: number;                   // context window size
    costUsd?: number;
  };
  checkpointId?: string;             // set when a checkpoint was saved
};
```

### AgentStatus

```ts
type AgentStatus =
  | "idle"
  | "running"
  | "waiting_permission"
  | "waiting_user"
  | "completed"
  | "failed"
  | "interrupted"
  | "cancelled"
  | "provider_limit";               // triggers handoff UI
```

---

## 6. Block Provenance — Every Block Must Know Its Source

Every block carries a `source` that links it back to the raw ACP events:

```ts
type BlockSource = {
  eventIds: string[];
  seqStart?: number;
  seqEnd?: number;
};

interface BaseBlock {
  id: string;
  schemaVersion: 1;
  source: BlockSource;              // ← provenance on every block
}
```

This enables the evidence chain:

```
FindingCard
    ↓
EvidenceBlock (kind: "http")
    ↓
source.eventIds → ["run:184"]
    ↓
Raw ACP command output
```

**Current status:** `sourceEventIds` and `sourceSeq` exist on blocks but are inconsistently populated. The `BlockSource` shape should be adopted as a first-class field.

---

## 7. Full Block Type Union

```ts
type AgentBlock =
  | SummaryBlock
  | ExplanationBlock
  | MarkdownBlock           // ← explicit fallback — never drop agent output
  | ToolStepBlock
  | FindingBlock
  | TestRunBlock
  | ErrorBlock
  | PermissionBlock
  | FileChangeBlock
  | SafetyAskBlock
  | CodeBlock
  | DiffBlock
  | EvidenceBlock           // ← promoted to first-class block
  | CheckpointBlock;        // ← new: handoff/interrupt UI
```

**Fallback rule:** If the normalizer cannot confidently structure agent output, emit a `MarkdownBlock`. Never discard text.

---

## 8. EvidenceBlock — Promoted to First-Class

Currently `EvidenceBlock` is just `label: value` rows. It should support rich evidence kinds:

```ts
type EvidenceBlock = BaseBlock & {
  type: "evidence";
  kind:
    | "text"
    | "code"
    | "http"          // renders: method + path, status, body
    | "command"       // renders: command line, exit code, stdout/stderr preview
    | "file"          // renders: file path + content preview
    | "diff"          // renders: unified diff
    | "json"          // renders: formatted JSON
    | "table";        // renders: label-value rows (current behavior)
  title?: string;
  content: string;
  sourceEventIds: string[];
  expandable: boolean;
  truncated?: boolean;      // true if content was cut for performance
  fullOutputRef?: string;   // ledger reference to the full output
};
```

This solves:
- The "freeform code table inside FindingCard" missing feature
- Large-output protection (show preview + "Open full output")
- The HTTP evidence view from the security audit screenshot

---

## 9. CheckpointBlock — Handoff / Interrupt UI

New block type for provider limit / interruption / handoff:

```ts
type CheckpointBlock = BaseBlock & {
  type: "checkpoint";
  mode: "resume" | "handoff" | "retry";  // Option A: one block, different modes
  reason: "provider_limit" | "user_cancelled" | "error" | "max_turns" | "explicit_handoff";
  checkpointId: string;
  summary: {
    filesModified: number;
    commandsExecuted: number;
    testsPassed: number;
    testsFailed: number;
    notes: string[];          // e.g. "typecheck passed", "1 integration test failing"
  };
  availableEngines: EngineDescriptor[]; // see §17 for EngineCapabilities
};
```

**UI rendering:**
```
┌─────────────────────────────────────────┐
│ ⚠ Claude Code interrupted               │
│                                         │
│ Monthly provider limit reached          │
│                                         │
│ Checkpoint #184                         │
│                                         │
│ ✓ 3 files modified                     │
│ ✓ typecheck passed                      │
│ ✓ 7 commands executed                  │
│ ✗ 1 integration test failing            │
│                                         │
│ Continue task with                      │
│ [ Gemini ]        [ Codex ]             │
└─────────────────────────────────────────┘
```

---

## 10. Brief / Normal / Deep — Presentation Depth (Not Agent Config)

**Rule:** Depth controls *presentation* only. It does not change what the agent does, does not trigger new LLM calls, and does not change token usage.

```
Brief  → show only: SummaryBlock, one-line from ExplanationBlock, FindingCard titles only
Normal → full blocks (current behavior)
Deep   → expose all evidence + expand metadata, while still virtualizing/truncating huge content
         (Deep does NOT literally mount 10 MB of test output — virtualization still applies)
```

### Implementation

1. `AgentHeader` accepts `depth: DepthLevel` and `onDepthChange` props
2. `AgentMessage` holds `useState<DepthLevel>("normal")`
3. `messageToBlocks` is called once and produces all blocks
4. `filterBlocksByDepth(blocks, depth)` is called at render time — no re-normalization

```ts
export type DepthLevel = "brief" | "normal" | "deep";

function filterBlocksByDepth(blocks: AgentBlock[], depth: DepthLevel): AgentBlock[] {
  if (depth === "normal") return blocks;
  if (depth === "brief") {
    return blocks.filter(b =>
      b.type === "summary" ||
      b.type === "finding" ||      // titles only — FindingCard reads depth prop
      b.type === "explanation"     // oneLine only — ExplanationBlock reads depth prop
    );
  }
  // deep: return all blocks + mark evidence as expanded
  return blocks;
}
```

**Current status:** The Brief/Normal/Deep control in `AgentHeader.tsx` is purely decorative (hardcoded "Normal" active). ✅ Being implemented now.

---

## 11. Event Reducer — Incremental Normalization

### Conceptual Rename

The architecture should grow toward `reduceEvent(state, event)` rather than a monolithic `messageToBlocks(text, tools, git, ...)`. This is because the event sources now include:

- ACP events
- Ledger events
- Runtime events
- Permission events
- Verification events
- Filesystem events

| Old concept | New concept |
|---|---|
| `messageToBlocks.ts` | `eventReducer.ts` — the incremental reducer |
| `messageToBlocks()` | `reduceEvent(state, event)` |
| Batch text-to-blocks | Legacy/batch path for text-only normalization |

**Current behavior:** Normalization runs once after the agent responds.

**Target behavior:** Each ACP event triggers a ViewModel update:

```
ACP event arrives
        ↓
reduceEvent(currentViewModel, event)
        ↓
returns updated AgentViewModel
        ↓
React re-renders incrementally
```

Example stream:

| ACP Event | ViewModel Update |
|---|---|
| `agent_message_chunk: "I'll inspect..."` | `SummaryBlock` text grows |
| `tool_call: file.read package.json` | `ActivityItem` added |
| `tool_call: execute pnpm test` | `TestRunBlock` step added (status: running) |
| `tool_call_update: status=completed` | `TestRunBlock` step updates (status: passed) |
| Finding detected in text | `FindingBlock` appears |

**Current gap:** `messageToBlocks` is a pure batch function called in a `useMemo`. It should be refactored into an incremental reducer.

---

## 12. Declarative Action Contracts

Components should not call Tauri directly. Use typed action events:

```ts
type BlockAction =
  | { type: "open_file"; file: string; line?: number }         // filesystem file
  | { type: "open_output"; outputRef: string }                 // ledger output artifact
  | { type: "view_evidence"; evidenceId: string }
  | { type: "rerun"; testId: string }
  | { type: "send_message"; text: string }
  | { type: "apply_fix"; findingId: string }
  | { type: "continue_with_engine"; engineId: string; checkpointId: string }
  | { type: "cancel_run" }
  | { type: "resume_run"; checkpointId: string };
```

Note: `open_file` is for **filesystem files**. `open_output` is for **ledger output artifacts**. These are different resources — do not reuse `open_file` for ledger refs.

**Data flow:**

```
FindingCard → onAction({ type: "open_file", file: "lib/payments.ts", line: 42 })
    ↓
AgentMessage → props.onAction(action)
    ↓
App.tsx → actionHandler(action)
    ↓
Agent runtime → permission/security check
    ↓
invoke("open_path", ...) or send(...) or startWith(...)
```

**Action authorization rule:** The UI can *request* an action; the runtime must *authorize and validate* it. Never trust file paths, engine IDs, checkpoint IDs, or command strings coming from the renderer without validation. Infrastructure is the security boundary.

**Current status:** `FindingCard` action buttons have no `onClick`. `SafetyAskBlock` choice buttons have no handler. ✅ Being implemented now.

---

## 13. SafetyAskBlock — Safety Events Only

**Rule:** `SafetyAskBlock` must only appear when the *execution system* emits a safety/permission event. The frontend must not infer safety concerns from model text.

**Current gap:** `safetyAskFromText()` in `messageToBlocks.ts` uses a regex to detect safety language in the agent's text output. This is fragile and violates the principle that infrastructure (not the model) is the security boundary.

**Target:** The ACP server should emit an explicit `safety_ask` event type. The frontend renders it only on that event.

---

## 14. Large-Output Protection

For commands that emit large outputs (test logs, curl responses):

```
Evidence
────────────────────────────────────
Showing first 200 lines of 50,432

[Expand]   [Open full output]
```

- `EvidenceBlock.truncated = true` + `EvidenceBlock.fullOutputRef` (ledger key)
- The full output is stored in the ledger, not in the ViewModel
- "Open full output" → action `{ type: "open_output", outputRef: ledgerRef }`

Note: This uses `open_output`, **not** `open_file` — ledger output artifacts and filesystem files are different resources.

---

## 15. Retry / Resume / Handoff Semantics

Three distinct operations — must be represented separately in the UI:

| Action | Meaning | UI label |
|---|---|---|
| **Retry** | Run the entire task again from scratch | "Retry" |
| **Resume** | Continue from last checkpoint, same engine | "Resume" |
| **Handoff** | Continue from checkpoint, different engine | "Continue with Gemini" |

The `CheckpointBlock` component renders all three as distinct buttons with distinct actions.

---

## 16. Cancellation / Stop State

The `AgentStatus` includes `"cancelled"`. The UI flow:

```
status: running
    ↓
User clicks [ Stop ]
    ↓
action: { type: "cancel_run" }
    ↓
status: "interrupted"  (while graceful shutdown runs)
    ↓
status: "cancelled"    (after agent acknowledges)
    ↓
CheckpointBlock appears with checkpoint summary
```

---

## 17. Engine Capabilities Model

`availableEngines: string[]` is too simple for a growing engine registry. Use a typed capabilities model:

```ts
type EngineCapabilities = {
  streaming: boolean;
  toolCalls: boolean;
  fileEditing: boolean;
  permissions: boolean;
  resume: boolean;       // can resume from a checkpoint
  handoff: boolean;      // can receive a HandoffContext
};

type EngineDescriptor = {
  id: string;
  label: string;
  provider: string;
  model?: string;
  capabilities: EngineCapabilities;
};
```

Example registry entries:

| Engine | streaming | tools | file editing | resume | handoff |
|---|---|---|---|---|---|
| Claude Code | ✅ | ✅ | ✅ | ✅ | ✅ |
| Gemini CLI | ✅ | ✅ | ✅ | ✅ | ✅ |
| Codex | ✅ | ✅ | ✅ | ✅ | ✅ |
| Simple chat | ✅ | ❌ | ❌ | ❌ | ❌ |

The `CheckpointBlock` only shows engines where `capabilities.handoff === true`.

---

## 18. Event Ordering + Idempotency

WebSocket + streaming systems can produce duplicate events, out-of-order delivery, and replay on reconnect. The incremental reducer must handle these explicitly.

```ts
type EventCursor = {
  lastSeq: number;
  processedEventIds: Set<string>;
};
```

Processing logic:

```ts
function shouldProcessEvent(event: NormalizedEvent, cursor: EventCursor): boolean {
  // Already processed by sequence number
  if (event.seq !== undefined && event.seq <= cursor.lastSeq) return false;
  // Already processed by event ID (idempotency key)
  if (event.id && cursor.processedEventIds.has(event.id)) return false;
  return true;
}
```

This prevents `test started` appearing three times after a reconnect.

**Cases to handle explicitly:**

| Case | Handling |
|---|---|
| Duplicate event | Skip if `event.id` already in `processedEventIds` |
| Out-of-order event | Buffer or apply with seq gap detection |
| WebSocket reconnect | Replay from last known `lastSeq` |
| Missed events | Request gap-fill from server or treat as partial |

---

## 19. Full Block State Lifecycle

### TestRunBlock step states
```ts
type StepStatus = "queued" | "running" | "passed" | "failed" | "cancelled" | "timeout";
```

### Tool step states
```ts
type ToolCallStatus = "pending" | "in_progress" | "completed" | "failed" | "cancelled";
```

### FindingBlock verification states
```ts
type FindingStatus = "discovered" | "verifying" | "verified" | "unverified" | "false_positive";
```

---

## 20. Files / Git — Authoritative Data Sources

**Rule:** File and git data must come from actual filesystem/ledger state — not inferred from model text.

```
Files tab
 ↓
FileActivity[] from ledger
 ↓
actual: file.read / file.written / file.created / file.deleted

Git tab
 ↓
GitContext from real git status/diff
 ↓
branch, staged, unstaged, untracked, commits
```

---

## 21. Normalization Test Fixtures — Fixture Location

Fixtures must live in one canonical location. **Do not split** between `apps/desktop` and `packages/agent`.

**Decision:** If normalization is desktop-only, fixtures live here:
```
apps/desktop/src/agent/normalize/__fixtures__/
  explanation.json          — technical explanation with constants + math
  security-audit.json       — multiple finding cards with evidence
  safety-ask.json           — ethical interception with concerns + choices
  tool-error.json           — failed tool call
  markdown-fallback.json    — unrecognized text → MarkdownBlock
  multi-file-diff.json      — diff across 5 files
  interrupted-agent.json    — CheckpointBlock with handoff options
  provider-limit.json       — provider_limit status → CheckpointBlock
  streaming-sequence.json   — incremental event sequence (for eventReducer)
```

If normalization will be shared across CLI + desktop, move the normalizer into a shared package:
```
packages/agent/src/normalize/__fixtures__/   ← only if normalizer moves here
```

**Do not create two normalizers** (`desktop normalizer` + `package normalizer`) that can diverge.

```ts
expect(reduceEvents(fixture.input)).toEqual(fixture.expected);
```

---

## 22. Current Implementation Status

### ✅ Implemented (shipping now)

| Feature | Component | File |
|---|---|---|
| Engine label + meta badge in header | `AgentHeader` | `AgentHeader.tsx` |
| Brief/Normal/Deep wired (depth state + callbacks) | `AgentHeader` | ✅ Landing now |
| Expandable step rows in TestRunBlock | `TestRunBlock` | ✅ Landing now |
| Collapsible concerns in SafetyAskBlock | `SafetyAskBlock` | ✅ Landing now |
| SafetyAsk choice buttons send messages | `SafetyAskBlock` | ✅ Landing now |
| Overview / Activity / Files / Git tabs | `AgentMessage` | Done |
| Finding cards with severity colors | `FindingCard` | Done |
| Explanation block (constants, code, math sections) | `ExplanationBlock` | Done |
| Copy button | `AgentHeader` | Done |
| Engine switcher dropdown in top-right | `App.tsx` | Done |
| Install button for missing engines | `App.tsx` | Done |

### 🔴 High Priority

| Feature | What | File(s) |
|---|---|---|
| `TaskState` type + reducer | Authoritative execution state separate from AgentViewModel | new `reduceEvent.ts`, `types.ts` |
| `HandoffContext` type | Full typed handoff object sent to Gemini/Codex | new `handoff.ts`, `types.ts` |
| Immutable checkpoint semantics | Define trigger rules + sequential IDs, no mutation | `checkpoint.ts` |
| `BlockSource` on every block | Add `source: BlockSource` to BaseBlock | `types.ts`, `eventReducer.ts` |
| `onAction` prop chain | Wire FindingCard + SafetyAsk buttons through `AgentMessage` → `App.tsx` | `AgentMessage.tsx`, `FindingCard.tsx`, `App.tsx` |
| `CheckpointBlock` with `mode` field | `mode: "resume" \| "handoff" \| "retry"` + `EngineDescriptor[]` | `types.ts`, new `CheckpointBlock.tsx` |
| `AgentStatus` in ViewModel | Full status enum, not just "running/completed/failed" | `types.ts`, `runMeta.ts` |
| EvidenceBlock promoted to first-class | Rich `kind`-based evidence | `types.ts`, `EvidenceBlock.tsx` |
| `open_output` action type | Separate ledger artifact action from `open_file` | `types.ts`, `App.tsx` |

### 🟠 Medium Priority

| Feature | What | File(s) |
|---|---|---|
| `EngineCapabilities` + `EngineDescriptor` | Typed capability model replacing `string[]` | `engines-registry.ts` |
| `EventCursor` + idempotency | Handle duplicates, reconnect replay, out-of-order events | `eventReducer.ts`, `useAcpChat.ts` |
| Action authorization in runtime | Validate all actions before execution | `App.tsx`, Tauri backend |
| Workspace verification on handoff | New engine inspects git/diff before continuing | handoff flow |
| Schema versioning on `TaskState`, `HandoffContext`, `Checkpoint` | Version all serialized structures | `types.ts` |
| Error boundaries per block | `AgentMessage > ErrorBoundary > BlockRenderer` | `AgentMessage.tsx`, new `BlockErrorBoundary.tsx` |
| Accessibility | `<button>` for all interactive elements, `aria-expanded`, `aria-selected`, focus mgmt | All block components |
| `filterBlocksByDepth()` | Filter blocks by Brief/Normal/Deep (with virtualization note) | `AgentMessage.tsx`, new `filterBlocks.ts` |
| `durationMs` + token usage in header | Listen for `done` WebSocket event | `useAcpChat.ts`, `runMeta.ts` |
| Large-output truncation | `EvidenceBlock.truncated` + "Expand" button + `open_output` action | `EvidenceBlock.tsx` |
| SafetyAsk from events only | Remove regex-based `safetyAskFromText` | `eventReducer.ts`, ACP server |
| Stop / cancel button | Cancel action + status update | `App.tsx`, `useAcpChat.ts` |

### 🟡 Lower Priority

| Feature | What | File(s) |
|---|---|---|
| Rename `messageToBlocks` → `eventReducer` | Refactor to incremental `reduceEvent(state, event)` | `eventReducer.ts`, `useAcpChat.ts` |
| Mobile/narrow-window layout | Responsive header + tab overflow handling | `AgentHeader.tsx`, `AgentMessage.tsx` |
| Activity tab virtualization | Virtual scroll once activity exceeds ~100 rows | `AgentMessage.tsx` |
| Interactive math slider | Live-evaluating range slider in ExplanationBlock | `ExplanationBlock.tsx` |
| Retry / Resume / Handoff buttons | Three distinct actions in CheckpointBlock | `CheckpointBlock.tsx` |
| Normalization test fixtures | JSON fixtures + vitest assertions | `normalize/__fixtures__/` |
| "Jump to latest" sticky button | Scroll anchor | `AgentMessage.tsx` |

---

## 23. Key Files Reference

| File | Purpose |
|---|---|
| `apps/desktop/src/agent/normalize/types.ts` | All block + state TypeScript types — **start every change here** |
| `apps/desktop/src/agent/normalize/eventReducer.ts` | Incremental reducer → `AgentViewModel` (replaces `messageToBlocks.ts`) |
| `apps/desktop/src/agent/normalize/messageToBlocks.ts` | Legacy batch path — kept for text-only normalization |
| `apps/desktop/src/agent/normalize/runMeta.ts` | Computes `AgentRunMeta` from tools + git + config |
| `apps/desktop/src/agent/execution/reduceEvent.ts` | TaskState reducer — authoritative execution state |
| `apps/desktop/src/agent/execution/checkpoint.ts` | Immutable checkpoint creation + trigger rules |
| `apps/desktop/src/agent/execution/handoff.ts` | `buildHandoffContext()` — serializes TaskState → HandoffContext |
| `apps/desktop/src/agent/components/AgentMessage.tsx` | Root container — tab bar + block dispatcher + error boundaries |
| `apps/desktop/src/agent/components/AgentHeader.tsx` | Engine label + meta badge + depth control + copy |
| `apps/desktop/src/agent/components/ExplanationBlock.tsx` | IN ONE LINE + sections |
| `apps/desktop/src/agent/components/FindingCard.tsx` | Severity finding cards |
| `apps/desktop/src/agent/components/TestRunBlock.tsx` | Run log with step statuses |
| `apps/desktop/src/agent/components/SafetyAskBlock.tsx` | STOPPING TO ASK interception |
| `apps/desktop/src/agent/components/EvidenceBlock.tsx` | Evidence rows (promoted to first-class with `kind`) |
| `apps/desktop/src/agent/components/CheckpointBlock.tsx` | Handoff / interrupt / resume UI |
| `apps/desktop/src/agent/components/BlockErrorBoundary.tsx` | Per-block error boundary — one bad block doesn't crash all |
| `apps/desktop/src/useAcpChat.ts` | WebSocket connection + ACP message parsing + EventCursor |
| `apps/desktop/server/index.ts` | Node server — ACP session + WebSocket bridge |
| `packages/agent/src/engines.ts` | Engine registry |
| `packages/agent/src/engines-registry.ts` | Pure engine config with `EngineDescriptor` + `EngineCapabilities` |
