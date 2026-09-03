# UI Implementation Guide — Agent Response Cards

> Reference screenshots: `/Users/vibhu/Downloads/ui/` (4 screenshots from 2026-09-03 14:58–14:59)

This document describes every UI feature visible in the reference screenshots and maps each one to its current implementation status.

---

## Architecture Overview

Every agent response is rendered by **`AgentMessage.tsx`** which:

1. Calls `messageToBlocks()` → converts raw `(text, tools, git)` into a typed `AgentViewModel`
2. Renders `<AgentHeader>` at the top of the card
3. Renders an **Overview / Activity / Files / Git** tab bar
4. Dispatches each block to its component via `renderBlocks()`

```
AgentMessage
├── AgentHeader          (engine name · model · time · files · tokens · cost | Brief/Normal/Deep | Copy)
├── Tab Bar              (Overview | Activity | Files | Git)
└── Block Renderer
    ├── ExplanationBlock (IN ONE LINE + section cards + math/code/constant panels)
    ├── FindingCard      (CRITICAL/HIGH/MEDIUM/LOW/INFO severity cards)
    ├── TestRunBlock     (run log with step-by-step statuses)
    ├── SafetyAskBlock   (STOPPING TO ASK — ethical concern interception)
    ├── ToolStepBlock    (collapsible tool calls)
    ├── CodeBlockView    (syntax-highlighted code + multi-file tabs + diff)
    ├── DiffBlock        (unified diff view)
    ├── FileChangeBlock  (git file change list)
    ├── EvidenceBlock    (key-value diagnostic rows inside FindingCard)
    ├── SummaryBlock     (short text summary header)
    ├── MarkdownBlock    (fallback raw markdown)
    ├── ErrorBlock       (tool error display)
    └── PermissionBlock  (permission request display)
```

---

## Screenshot 1 — ExplanationBlock (Deep Technical Explanation)

**What it shows:** A structured explanation of `MAINTENANCE_MARGIN_RATIO / MMR_SCALE`

### ✅ Implemented

| UI Element | Component | File |
|---|---|---|
| Orange `*` sparkle icon + engine label | `AgentHeader` | `AgentHeader.tsx:29–32` |
| `sonnet · 9.4s · 3 files` meta badge | `AgentHeader` | `AgentHeader.tsx:18–24` |
| **Brief / Normal / Deep** segmented control | `AgentHeader` | `AgentHeader.tsx:43–56` |
| Copy button | `AgentHeader` | `AgentHeader.tsx:57–65` |
| `IN ONE LINE` orange label + summary sentence | `ExplanationBlock` | `ExplanationBlock.tsx:13–16` |
| Section nav pills | `ExplanationBlock` | `ExplanationBlock.tsx:17–27` |
| **Constants section** — 2-column stat cards | `ExplanationBlock` | `ExplanationBlock.tsx:31–52` |
| **Code section** — multi-file tabbed panel | `ExplanationBlock` → `CodeBlockView` | `ExplanationBlock.tsx:55–72` |

### ❌ Missing

| Missing Feature | What It Should Do | File to Edit |
|---|---|---|
| **Interactive math slider** | Range slider that recomputes `notional`, `maintenance`, `positionEquity`, `isLiquidatable` live with color bar | `ExplanationBlock.tsx` — new `MathSection` component |
| **Duration in header** (`9.4s`) | `durationMs` field typed but never populated | `runMeta.ts`, `useAcpChat.ts` |
| **Brief/Normal/Deep** wired up | Currently "Normal" is always hardcoded active, buttons have no onClick | `AgentHeader.tsx`, `AgentMessage.tsx`, `messageToBlocks.ts` |
| **"Jump to latest"** sticky button | Appears at bottom when scrolled up in a long turn | New component in `AgentMessage.tsx` |

---

## Screenshot 2 — TestRunBlock + FindingCards (Audit Run)

**What it shows:** An agent that ran curl tests against the live app and found security bugs

### ✅ Implemented

| UI Element | Component | File |
|---|---|---|
| ✅/❌ per-step status icons + labels + kind badges | `TestRunBlock` | `TestRunBlock.tsx` |
| **CRITICAL/HIGH** finding cards with colored left bar | `FindingCard` | `FindingCard.tsx:8–14` |
| Severity badge + file location | `FindingCard` | `FindingCard.tsx:26–47` |
| Body text inside finding | `FindingCard` | `FindingCard.tsx:49` |
| Evidence key-value rows | `EvidenceBlock` | `EvidenceBlock.tsx` |
| Action buttons ("Add session checks", "Open file") | `FindingCard` | `FindingCard.tsx:51–64` |

### ❌ Missing

| Missing Feature | What It Should Do | File to Edit |
|---|---|---|
| **"All steps / Problems only" filter** | Toggle in header right to filter run log to only failed steps | `TestRunBlock.tsx` + `AgentHeader.tsx` |
| **Env stat cards** (MONGO CONTAINER, DEV SERVER, API PROBES) | Rich status cards with dot, host:port, description — completely different from current `Commands/Status/Problems` grid | `TestRunBlock.tsx` + normalizer data shape |
| **Expandable step rows** | `▸` chevron reveals raw curl output, HTTP status, response body | `TestRunBlock.tsx` — add `useState` per step |
| **Finding metadata footer** (`4 files · ~20 lines`) | Shows scope of the fix | `FindingCard.tsx` |
| **Action button handlers** | "Open file" should invoke Tauri shell; "Add session checks" should apply the fix | `FindingCard.tsx` → Tauri `invoke("open_file", ...)` |

---

## Screenshot 3 — FindingCard Extended

**What it shows:** Continuation of security audit finding cards

### ✅ Implemented

| UI Element | Component | File |
|---|---|---|
| HIGH card with `lib/payments.ts:42` location | `FindingCard` | `FindingCard.tsx:42–47` |
| Action buttons per finding | `FindingCard` | `FindingCard.tsx:51–64` |

### ❌ Missing

| Missing Feature | What It Should Do | File to Edit |
|---|---|---|
| **Freeform code table inside finding** | `POST /api/payments → 201` table — currently `EvidenceBlock` only supports label:value pairs | `EvidenceBlock.tsx` — add `code` row type |
| **Narrative text between findings** | Closing paragraph ("Both were reproduced…") between cards | `messageToBlocks.ts` — add paragraph block between findings |

---

## Screenshot 4 — SafetyAskBlock (Ethical Interception)

**What it shows:** The agent intercepts a SWIFT/Wise clone and asks about intent

### ✅ Implemented

| UI Element | Component | File |
|---|---|---|
| `STOPPING TO ASK` badge | `SafetyAskBlock` | `SafetyAskBlock.tsx` |
| `no files edited · no commands run` note | `SafetyAskBlock` | `SafetyAskBlock.tsx` |
| Body + `WHAT IT ACTUALLY IS` section | `SafetyAskBlock` | `SafetyAskBlock.tsx` |
| Numbered concern rows with title + tag badge | `SafetyAskBlock` | `SafetyAskBlock.tsx` |
| `"Before I go further"` context card with choice buttons | `SafetyAskBlock` | `SafetyAskBlock.tsx` |

### ❌ Missing

| Missing Feature | What It Should Do | File to Edit |
|---|---|---|
| **Collapsible concern rows** | `▸` per concern — collapsed by default, expands to show code evidence | `SafetyAskBlock.tsx` — add `useState` per concern index |
| **"tap to see the evidence" subtitle** in `WHAT CONCERNS ME` | Subtle hint text | `SafetyAskBlock.tsx` |
| **Context choice button handlers** | Clicking "Internal ops prototype" sends follow-up message to agent | `SafetyAskBlock.tsx` — needs `onSend` prop wired from `AgentMessage` → `App.tsx` |
| **Bottom action suggestion row** | 3 ghost buttons at very bottom: "List every file you read", "Show the tracker page", "Just fix the security bugs" | `SafetyAskBlock.tsx` — new `suggestions` section |

---

## Priority Backlog

Ordered by user impact:

### 🔴 High Priority

1. **Wire Brief/Normal/Deep** — currently a pure stub, no functionality
   - `AgentHeader.tsx` add state + `onDepthChange` prop
   - `AgentMessage.tsx` pass depth to `messageToBlocks`
   - `messageToBlocks.ts` filter blocks based on depth

2. **SafetyAskBlock choice buttons** — no response sent on click
   - `SafetyAskBlock.tsx` needs `onSend?: (text: string) => void` prop
   - `AgentMessage.tsx` pass `send` from `useAcpChat`
   - `App.tsx` ensure `send` is forwarded all the way down

3. **FindingCard "Open file" button**
   - Import Tauri `invoke` in `FindingCard.tsx`
   - Call `invoke("open_path", { path: block.location.file })` from Rust side

### 🟡 Medium Priority

4. **Expandable TestRunBlock steps** — add `useState<Set<string>>` for expanded step IDs
5. **Expandable SafetyAskBlock concerns** — add `useState<number | null>` for open concern index
6. **Duration in AgentHeader** — listen for `done` WebSocket event with timing data in `useAcpChat.ts`
7. **"All steps / Problems only" filter** — add filter toggle to `TestRunBlock`

### 🟢 Low Priority

8. **Interactive math slider** in `ExplanationBlock` — complex, needs expression parser
9. **"Jump to latest"** sticky scroll button in `AgentMessage`
10. **Env stat cards** in `TestRunBlock` — needs new data shape from ACP session

---

## Key Files Reference

| File | Purpose |
|---|---|
| `apps/desktop/src/agent/components/AgentMessage.tsx` | Root container — tab bar + block dispatcher |
| `apps/desktop/src/agent/components/AgentHeader.tsx` | Header row — engine label + meta badge + Brief/Normal/Deep + copy |
| `apps/desktop/src/agent/components/ExplanationBlock.tsx` | IN ONE LINE + section cards |
| `apps/desktop/src/agent/components/FindingCard.tsx` | CRITICAL/HIGH/etc. finding cards |
| `apps/desktop/src/agent/components/TestRunBlock.tsx` | Run log with step statuses |
| `apps/desktop/src/agent/components/SafetyAskBlock.tsx` | STOPPING TO ASK interception |
| `apps/desktop/src/agent/components/EvidenceBlock.tsx` | Key-value diagnostic rows |
| `apps/desktop/src/agent/normalize/messageToBlocks.ts` | Converts (text, tools, git) → AgentViewModel |
| `apps/desktop/src/agent/normalize/runMeta.ts` | Computes header metadata (model, filesChanged, etc.) |
| `apps/desktop/src/agent/normalize/types.ts` | All block TypeScript types |
| `apps/desktop/src/useAcpChat.ts` | WebSocket connection + message parsing |
