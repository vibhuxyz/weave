# How agents work: `@builder` → "create an express app"

> Traced from the code, 2026-09-04. Files cited are under `src/` unless noted.
> Companion to `ARCHITECTURE.md` (the process/ACP picture) — this doc is the
> single vertical slice: what happens between typing `@builder create an
> express app` and the agent writing files.
>
> **Part I** — how it works in the code today.
> **Part II** — the production-grade target: project-level persona config,
> multi-persona resolution, policy separation, conditional/reviewer roles, and
> runtime-enforced quality gates.

---

> **Port status (2026-09-04).** `my-berd-app` now implements the adapted flow:
> - Persona instructions ride every prompt, wrapped in `<active-persona>` with
>   the "adopt as your system prompt, answer as this persona" framing —
>   `formatPersonaSystemPrompt` in `src/useAgents.ts`, composed server-side in
>   `server/index.ts` (`composeSystem`).
> - `<available-skills>` catalog: `discoverSkills` / `formatSkillCatalog` in
>   `packages/core/src/skills.ts`, scanned per connection from
>   `<project>/.weave/skills` and `<project>/.agents/skills`, injected into the
>   same `<system>` block.
> - `@file` mention category: a path-shaped `@` query (`@src/App.tsx`) queries
>   the server (`list-files` → `files`) and inserts the project-relative path as
>   literal text.
> - Per-session engine switch with no Rust restart: `EngineSupervisor`
>   (`packages/agent/src/supervisor.ts`) keeps engine children warm for 30s; a
>   switch starts a fresh session on the new engine and carries a transcript
>   digest forward (`<prior-conversation>`). In-flight prompts are superseded.
> - Not ported (by design, see the note in the scope discussion): the bundled
>   skills seeding path, build-time skill validation, and a manual `@skill`
>   category.

---

# Part I — How it works today

## 0. TL;DR

1. **`@` opens the mention menu.** `@builder` fuzzy-matches an **agent
   (persona)** — a saved Markdown file with a name, avatar, provider/model, and
   a system prompt.
2. **Picking it does not send anything.** It *reconfigures the current chat
   session*: sets the harness (Goose vs an external agent like Claude Code),
   sets the model, records `personaId` on the session, and strips the
   `@builder` text from the composer.
3. **On send**, the app assembles one system prompt from: persona instructions
   + workspace/project context + a catalog of available **skills** + app-level
   norms. It ships that to the agent — via Goose's real system-prompt channel,
   or, for external agents, as a one-time in-band "handoff" block.
4. The prompt (`create an express app`) goes over the local **ACP WebSocket**
   to `goosed`, which either runs the Goose agent loop itself or relays to a
   bridge (Claude Code / Codex). The agent loops: think → call a tool (write
   file, run `npm`) → observe → repeat.
5. Tool calls that touch the disk or shell come back as **permission
   requests**; results stream back as `session/update` notifications and render
   in the transcript.

There is also a **special `@agent-builder` path** (building a *new agent*, not
an app) — covered in §7. If your `@builder` is really `@agent-builder`, read
that section.

---

## 1. What "an agent" is in Berd

Berd has no agent of its own. It is a UI shell that drives an external agent
process over ACP (see `ARCHITECTURE.md` §1). What the UI calls an "agent" is a
**persona**: a saved configuration a chat session runs against.

`Persona` (`shared/types/agents.ts`):

```ts
interface Persona {
  id: string;
  displayName: string;        // what "@builder" matches
  avatar?: string | null;
  systemPrompt: string;       // the persona's instructions
  provider?: string;          // harness OR model provider ("goose", "claude-acp", ...)
  modelProviderId?: string;
  model?: string;
  isBuiltin: boolean;
  writable: boolean;
}
```

### Where personas come from

- **User-created**, via the Agents view / `agent-builder` skill. Stored as
  Agent Markdown with YAML frontmatter:
  - Global: `~/.agents/agents/<slug>.md`
  - Project-local: `<project>/.agents/agents/<slug>.md`
- **Bundled**, seeded on startup by the Rust core
  (`src-tauri/src/services/bundled_agents.rs`) from `distro/agents/` into
  `~/.agents/agents/`, tracked by a marker file
  (`.berd-bundled-agents.json`) so re-seeds and updates are idempotent.
  Bundled agents must carry `metadata.berdBundled: true` and an
  `avatar: app-avatar:<id>` ref (enforced by
  `scripts/validate-bundled-agents.ts` at build time).

Personas are loaded and kept fresh by `usePersonas()`
(`features/agents/hooks/usePersonas.ts`): initial `listPersonas`, then a 60s
refresh and a refresh on window focus, backed by `useAgentStore`.

> **`@builder` is almost certainly a persona named "Builder"** (or a fuzzy
> match to one). There is no bundled persona literally called `builder` in the
> public `distro/` — so it is either your own agent, an enterprise-distro
> agent, or a fuzzy hit on `agent-builder` (§7).

---

## 2. Typing `@` — the mention system

Three files:

| File | Job |
|---|---|
| `features/chat/ui/mentionDetection.ts` | Pure detection: find the active `@`/`/` trigger at a token boundary, extract the query, score candidates |
| `features/chat/ui/MentionAutocomplete.tsx` | The dropdown UI + keyboard nav |
| `features/chat/hooks/useMentionHandlers.ts` | Wires personas + skills + files into the menu, owns the selection handlers |

### Categories

`@` cycles three categories (`AtMentionCategory`): **`agents`**, **`files`**,
**`skills`**. The default category is a user preference
(`features/chat/lib/mentionPreference.ts`); with file mentions disabled it
forces `agents`.

- `@builder` in the **agents** category → `MentionItem` of `type: "persona"`.
- The match is fuzzy (`fuzzyMatch` / `Fzf`), so `@bld` also hits "Builder".

### Trigger rules (`mentionDetection.ts`)

- The `@` must be at a **token boundary** (start of input or preceded by
  whitespace) — `findLastAtMentionTrigger`.
- Query length caps: 50 chars for text mentions, 256 for path-shaped ones.

---

## 3. Selecting `@builder` — session reconfiguration

`handlePersonaMentionSelect` in `useMentionHandlers.ts`:

1. If a *different* persona was already mentioned in the draft, its
   `@OldName` text is removed first.
2. The `@builder` token is replaced/stripped from the composer text
   (`replaceMentionQuery` / `removeMentionQuery`) — the persona is a
   *selection*, not literal prompt text.
3. `registerCompletedMention("Builder")` records it.
4. **`onPersonaChange(persona.id)`** fires. That callback lands in
   `useChatSessionController.ts` (~line 1533).

### What `onPersonaChange` does (`useChatSessionController.ts` ~1533–1660)

```
persona picked
  → resolvePersonaTarget(persona)          // persona → SessionExecutionTarget
      = personaExecutionTarget(persona, { providers, models, catalogEntries })
  → if target has a concrete model:
        applyExecutionTarget + setProvider/setModel over ACP
    else:
        stash as pendingExecutionTarget (resolved at send time)
  → if an Agent record is linked to this persona → setPendingPersonaId
  → chatSessionStore.patchSession(sessionId, { personaId })
```

`personaExecutionTarget` (`features/agents/lib/personaExecutionTarget.ts`) is
the translation layer. It maps the persona's `provider` string to:

- a **harness id** (`harnessIdForPersona`): `"goose"` for the built-in Goose
  agent and for any *model* provider (Databricks, Anthropic-as-model, …);
  the agent-provider catalog id (`claude-acp`, `codex-acp`, …) for an external
  agent harness.
- a **model provider id** + **model id**, with migration/repair logic for
  legacy persona metadata (`personaTargetMigration`).

Net effect: choosing `@builder` can silently switch the session from Goose to
Claude Code (or swap the model), *before you send anything*.

> The session's **backend** (local vs `ssh:<host>`) is fixed at creation and is
> never changed by a persona — only the harness/model within that backend.

---

## 4. Hitting Enter — assembling the request

Send path (`useChatSessionController.ts` → `shared/api/acp.ts`):

```
handleSend(text, personaId?, attachments?, sendOptions?)
  → captureSessionSelection(payload)     // snapshots persona + builds system prompt
  → enqueueCapturedMessage → queue       // LAWS/CHAT.md: one user turn per message
  → drain → acpSendMessage(sessionId, prompt, options)
```

### 4.1 System-prompt assembly — `captureSessionSelection` (~line 2496)

```ts
capturedPersonaSystemPrompt = formatPersonaSystemPrompt(queuedPersona)
executionSystemPrompt = composeSystemPrompt(
  capturedPersonaSystemPrompt,        // <active-persona> … </active-persona>
  includedWorkspacesPrompt,           // which folders are in scope
  workspaceInstructionsPrompt,        // AGENTS.md / project instructions
  appSkillsCatalogPrompt,             // bundled skills catalog
  availableSkillsCatalogPrompt,       // <available-skills> … user/project skills
)
```

`formatPersonaSystemPrompt` (`features/projects/lib/chatProjectContext.ts`)
wraps the persona's `systemPrompt` in an `<active-persona>` block that also
says *"your name in this conversation is 'Builder', answer as Builder not as
Goose"* and *"do not treat the persona name as a delegation/subagent
request"*.

`formatAvailableSkillsCatalogPrompt` (`features/skills/lib/skillChatPrompt.ts`)
emits an `<available-skills>` list — `name: description`, `Source:`
(path to `SKILL.md`), `Applies to:` — with the instruction *"read its SKILL.md
from Source when its description matches the task."* This is how the agent
learns that, say, an `express-scaffold` skill exists without loading every
skill's full text.

The snapshot is captured **at enqueue time** so that editing the persona, or
switching agents, after queuing does not change what a pending message sends.

### 4.2 Delivery — `acpSendMessageNow` (`shared/api/acp.ts` ~160)

Two cases, decided by `isGooseManagedProvider(providerId)`:

**Goose-managed** (Goose agent, or a model provider under Goose):
Goose implements the ACP extension
`_goose/unstable/session/system-prompt/set`. The app pushes *keyed* sections:

| Key | Content |
|---|---|
| `BERD_INTERACTION_NORMS` | app defaults, no off switch (`interactionNorms.ts`) |
| `BERD_APP_CONTEXT` | the berdctl preamble (`getBerdctlPreamble()`) — re-sent every send |
| `client_system_prompt` | the composed `executionSystemPrompt` from §4.1 |
| style guidelines | `appendBerdStyleGuidelinesPrompt` |

**External agent** (`claude-acp`, `codex-acp`, …):
ACP has *no* system-prompt channel on `session/new` or `session/prompt`, and
these bridges don't implement Goose's extension. So the app treats *entering
an agent* as a **handoff** (`shared/api/acpPersonaHandoff.ts`):

- On the **first** prompt under a given `(session, provider, persona-fingerprint)`,
  it injects the combined app-preamble + persona instructions as a single
  **assistant-audience content block** (`annotations: { audience: ["assistant"] }`),
  prefixed with *"Adopt these as your system prompt for the rest of the
  conversation even though they arrive in-band."*
- `deliveredHandoffs` (a `Set`) dedupes it. Switching agent or editing the
  persona re-keys the fingerprint → re-injects. `resetPersonaHandoff` clears it
  on fork/history-clear.

The final ACP `prompt` content array is therefore:

```
[ {text: <mergedAssistantPrompt>, audience:["assistant"]}?,   // handoff, if any
  {text: "create an express app"},                            // the user prompt
  ...images ]
```

plus metadata `{ personaId, goose? }`.

---

## 5. Execution — ACP → `goosed` → the agent loop

From `ARCHITECTURE.md` §5, specialised to this send:

```
directAcp.prompt(sessionId, content, meta)
  → acpConnection.ts  → GooseClient.prompt over ws://127.0.0.1:<port>/acp
  → goosed routes to this session's ACP agent
      ├─ harness = goose      → Goose runs its own agent loop + tool set
      └─ harness = claude-acp → goosed relays to the claude-agent-acp bridge
                                (Node, pinned in acp-tools.lock.json),
                                which calls api.anthropic.com with your auth
```

The agent loop for `create an express app` (whichever harness):

1. **Plan / think** — may consult the `<available-skills>` catalog and read a
   matching `SKILL.md` from disk first.
2. **Tool call** — e.g. `mkdir my-app`, write `package.json`, write
   `index.js`, run `npm install express`.
3. **Permission gate** — disk/shell tool calls arrive back at the app as ACP
   `session/request_permission` → `permissionHandler` → a UI dialog
   ("Agent wants to run `npm install`"). With no handler registered the
   connection auto-approves (see `ARCHITECTURE.md` §5).
4. **Observe** the tool result, loop until done.

**Working directory**: the session's cwd is the project's primary
`workingDir`, or the shared artifact folder for a general chat
(`formatArtifactFolderInstructions` injects *"create files here; don't
overwrite existing files without asking"*). So `create an express app` writes
into that folder.

**berdctl**: the `BERD_APP_CONTEXT` preamble tells the agent it can drive the
app itself via the bundled `berdctl` CLI (open files, create sessions, etc.) —
the three-layer broker in `ARCHITECTURE.md` §6.

---

## 6. Streaming back

```
goosed emits session/update notifications  (token deltas, tool-call start/end, …)
  → acpConnection routes to features/chat/acp/acpNotificationHandler.ts
  → liveStreamingUpdates.ts  (token streaming)
  → chatStore updates
  → transcript re-renders (virtualized, @tanstack/react-virtual)
```

The user message carries `metadata.personaId` so the transcript renders it
against the Builder avatar/name. Telemetry (`trackChatMessageSent`,
`trackChatSessionStarted`) fires once per send from the post-commit callback,
with `hasPersona: true`.

---

## 7. The other `@builder`: `@agent-builder` (building a *new agent*)

If `@builder` resolves to **`agent-builder`**, this is a different, dedicated
flow — you are asking the agent to *create or edit a persona*, not scaffold an
Express app.

- **Bundled skill**: `distro/skills/agent-builder/SKILL.md` — teaches the agent
  the Agent Markdown format and where personas live.
- **Mention trigger**: `agentBuilderSession.ts` matches
  `/^@agent-builder\s*$/i` (`AGENT_BUILDER_MENTION_INVOCATION`).
- **Session intent**: the session is patched to `intent: "build-agent"` with
  `agentBuilderOpen: true` and a `targetAgentPath` pointing at a **draft**
  Agent Markdown file (`preSeedDraftAgent` → `createDraftAgentSource`, marked
  `properties.draft = true`).
- **Coordinator**: `useAgentBuilderCoordinator.ts` + `useChatSessionController`
  (`ensureCurrentSessionIsAgentBuilder`, `pendingBuilderActivationRef`) make
  sure a queued `@agent-builder` send runs against the builder session, and
  reconcile orphaned drafts on startup (`reconcileAgentBuilderSessions`).
- **Lifecycle**: draft → edited in the Agent Builder rail (or by the agent) →
  `promoteDraft` / `saveDraftAgentSession` turns the draft into a real persona;
  `discardDraftAgentSession` deletes it. `guardNavigation` prompts
  "save this draft?" before you leave.
- A legacy `agt-builder.md` bundled file is recognised and migrated by
  `bundled_agents.rs` (`LEGACY_AGT_BUILDER_FILE_*`).

So: **`@agent-builder create express app` is a category error** — that session
is wired to produce a `.md` persona file. To scaffold an app, use a normal
coding persona (or no persona) as in §1–§6.

---

---

# Part II — Target architecture (production-grade persona system)

Part I is **what exists today**. Part II is **where this should evolve**. The
current ACP/persona flow is the foundation; the additions are: project-level
persona configuration, multi-persona resolution, policy separation,
conditional/reviewer roles, and runtime-enforced quality gates.

## II.11 Conflict resolution between personas

Priority (II.3) resolves *cross-tier* conflicts. It does not resolve two
`always` personas at the same priority giving contradictory instructions
("prefer composition" vs "prefer inheritance"). Silent last-write-wins is the
failure mode to avoid.

### Rule

```
different priority   → higher priority wins, lower is omitted from context
same priority        → both are included, surfaced as an explicit conflict
                       block; the agent is told to ask, not to guess
same persona twice   → dedupe by personaId, keep highest priority instance
```

Equal priority is treated as a **config error the user should fix**, not
something the runtime silently arbitrates.

### Detection is structural, not semantic

Do not ask a model whether two prompts conflict. Detect only what is
declarable: personas may emit `constraints` — keyed, machine-comparable
assertions. Free-text `systemPrompt` is never compared.

```ts
// packages/core/src/persona/constraints.ts

/** A declarable, comparable assertion a persona makes. */
interface PersonaConstraint {
  key: string;            // "typescript.strict" | "style.stateManagement"
  value: string | boolean | number;
  hard: boolean;          // hard = never overridden by a lower tier
}

interface DetectedConflict {
  key: string;
  claims: Array<{ personaId: string; priority: number; value: unknown }>;
  resolution: "priority" | "unresolved";
  winner?: string;        // personaId, when resolution === "priority"
}

/** Pure. No model calls. */
declare function detectConflicts(
  personas: ResolvedPersona[],
): DetectedConflict[];
// TODO: group constraints by key
// TODO: drop keys where all values agree
// TODO: single max-priority claimant → resolution: "priority"
// TODO: tie at max priority → resolution: "unresolved"
```

### Where resolution happens

In the **Persona Resolver** (II.3), before the Context Composer — so the
composed context is already conflict-annotated.

```ts
interface ResolveResult {
  personas: ResolvedPersona[];
  conflicts: DetectedConflict[];
  omitted: Array<{ personaId: string; reason: "lower-priority" | "duplicate" }>;
}

declare function resolvePersonas(
  project: ProjectConfig,
  session: SessionPersonaState,
  task: TaskDescriptor,
): ResolveResult;
```

### Composed output for unresolved conflicts

```xml
<persona-conflicts>
  <conflict key="style.stateManagement">
    Senior Code Quality (80): prefer local state
    System Design (80): prefer a central store
    Neither takes precedence. Ask the user before choosing; do not pick silently.
  </conflict>
</persona-conflicts>
```

### Hard constraints outranks priority

A `hard: true` constraint from a **project policy** is never overridden by any
persona, regardless of priority — this is just the II.3 instruction hierarchy
enforced at the constraint level. A persona claiming a key that a hard policy
already owns is dropped and reported in `omitted`.

### UI

Project settings shows unresolved conflicts inline, next to the personas that
produced them, with a "change priority" affordance. This is the only place the
user is told; the transcript stays clean.

### Open question

Whether `constraints` are hand-authored in persona frontmatter or extracted
once at persona-save time. Hand-authored first — extraction is a later
optimisation and adds a model dependency to a deterministic path.

---

## II.12 Context budget

II.2 sells conditional personas as token savings but sets no ceiling. Without
one, an eight-persona project with a large skills catalog silently truncates —
and what gets truncated is decided by the harness, not by us.

### Budget is computed, then enforced by dropping whole units

```
model context window
  − reserved output tokens
  − reserved conversation history
  = system prompt budget
```

Never truncate mid-block. Drop whole personas, whole policy sections, whole
skill entries — a half-included persona is worse than an omitted one.

### Eviction order (first dropped first)

| Order | Unit | Note |
|---|---|---|
| 1 | Skill catalog entries | lowest priority personas' `Applies to:` first; the catalog is a pointer list, entries are individually droppable |
| 2 | `manual` personas | user-invoked, but this session only |
| 3 | `conditional` personas | not yet confirmed relevant |
| 4 | `always` personas, ascending priority | Docs before Performance before Code Quality |
| — | **Never dropped** | platform rules, hard project policies, workspace paths, the user request |

If the budget is still exceeded after dropping everything droppable, **fail the
send with a clear error** rather than shipping a context we know is truncated.

```ts
// packages/core/src/context/budget.ts

interface BudgetInput {
  contextWindow: number;
  reservedOutput: number;
  reservedHistory: number;
  units: ContextUnit[];        // each carries kind + priority + estimated tokens
}

interface ContextUnit {
  kind: "platform" | "hard-policy" | "policy" | "persona" | "skill" | "workspace";
  id: string;
  priority: number;
  droppable: boolean;
  estimateTokens: number;      // TODO: chars/4 to start; real tokenizer later
}

interface BudgetResult {
  included: ContextUnit[];
  dropped: Array<{ id: string; reason: "budget" }>;
  overBudget: boolean;         // true → caller must abort the send
}

declare function applyBudget(input: BudgetInput): BudgetResult;
// TODO: partition by droppable
// TODO: sum non-droppable; if it alone exceeds budget → overBudget
// TODO: evict droppable in the table's order until it fits
```

### Snapshot and surface

`dropped` goes into the task snapshot (II.6) alongside persona and policy
versions — "why did the agent ignore the Docs persona on task #1827?" must be
answerable. The transcript header (II.7) shows dropped always-on personas with
a warning affordance; skill-catalog eviction is silent.

### Estimation caveat

Token estimates are per-model. Budgeting against the wrong tokenizer is worse
than a fixed conservative margin — start with `chars / 4` and a 15% safety
margin, and only add real tokenizers once harness-specific counts matter.

---

## II.13 Cancellation and mid-flight edits

Three things can interrupt a task: user cancel, user edits/resends the message,
and app or connection death. Today's flow has no defined behaviour for any of
them once quality gates and a repair loop exist — and a repair loop that
survives its own task is the worst version of this bug.

### Cancellation points

| Phase | On cancel |
|---|---|
| Queued, not sent | Drop from queue. No ACP traffic. Snapshot discarded. |
| Prompt in flight | `session/cancel` over ACP; keep partial transcript. |
| Tool call running | Cancel; **do not roll back completed writes** — surface which files changed. |
| Gates running | Kill gate processes. Task → `CANCELLED`. |
| Repair loop | Stop before the next agent turn; do not start another fix attempt. |

The invariant: **cancel never leaves a gate process or a repair turn running**.

```ts
// packages/core/src/task/cancellation.ts

type CancelReason = "user" | "superseded" | "connection-lost" | "budget-exhausted";

interface Cancellable {
  cancel(reason: CancelReason): Promise<void>;
}

interface TaskCancellation {
  taskId: string;
  reason: CancelReason;
  phase: "queued" | "prompting" | "tool" | "gates" | "repair";
  filesModified: string[];    // reported, never auto-reverted
}

declare function cancelTask(
  taskId: string,
  reason: CancelReason,
): Promise<TaskCancellation>;
// TODO: resolve current phase from task state
// TODO: cancel children (gate processes, repair loop) before the ACP prompt
// TODO: emit CANCELLED to the ledger with filesModified
// TODO: idempotent — a second cancel is a no-op
```

### Edit-and-resend supersedes

Editing a sent message cancels the original with `reason: "superseded"` and
enqueues a **new task with a fresh snapshot** — persona, policy, and skill
versions are re-resolved at the new enqueue time. The superseded task keeps its
own snapshot; II.6's "config changes affect future tasks" still holds because
the edit *is* a future task.

### Partial work is never silently reverted

The agent may have written files before cancellation. Reverting is destructive
and the user may want what landed. Report, don't undo:

```
Cancelled. 3 files were modified before stopping:
  src/auth/login.ts · src/auth/reset.ts · prisma/schema.prisma
Quality gates did not run. [Run gates] [Revert all]
```

`Revert all` is an explicit user action, implemented as a git operation, and
only offered when the working tree was clean at task start.

### Connection loss

Distinct from cancel: the task is `RECOVERABLE`, not `CANCELLED`. On reconnect,
offer to re-run gates against the current tree rather than resuming a prompt
whose agent-side state is gone.

### Open question

Whether a cancelled task with `codeModified: true` should still require gates
before the *next* task starts. Leaning yes — otherwise failures accumulate
across cancellations and the next task's gate results are unattributable.


## II.0 The one distinction that matters

```
Persona        → WHO the agent is           → how to act
Project Policy  → WHAT is allowed / required  → the rules
Skill           → HOW to perform a task       → operational knowledge
Agent Runtime   → executes                    → Goose / Claude / Codex → model
Quality System  → verifies + repairs          → gates + review + fix loop
```

"Always on" must **not** mean "spawn a background AI". It means *automatically
included in the resolved context of every applicable new task*. No user action,
no extra process.

## II.1 Five separate concepts

| Concept | Owns | Lives | Today |
|---|---|---|---|
| **Persona** | behaviour, tone, engineering defaults | `~/.agents/agents/*.md` | ✅ exists (`Persona`) |
| **Project** | which personas/policies/harness apply here | project record | 🟡 partial (harness/model only) |
| **Session** | current conversation + active persona state | `chatSessionStore` | 🟡 single `personaId` only |
| **Policy** | project rules (strict TS, tests required, …) | project record | ⬜ new |
| **Skill** | detailed how-to (React, Prisma, Docker…) | `SKILL.md` folders | ✅ exists (catalog + on-demand read) |

### Persona (extended)

```ts
interface Persona {
  id: string;
  displayName: string;
  description: string;
  systemPrompt: string;
  provider?: string;
  model?: string;
  priority: number;                 // NEW — conflict resolution
  role?: "primary" | "reviewer" | "teacher" | "advisor";  // NEW
  capabilities?: string[];          // NEW
  version: number;                  // NEW — task provenance
  metadata?: Record<string, unknown>;
}
```

### Project (extended)

```jsonc
{
  "id": "project_123",
  "name": "Fish Marketplace",
  "agent": { "harness": "claude-acp", "model": "claude-sonnet" },
  "personas": [
    { "personaId": "code-quality", "enabled": true, "mode": "always",      "priority": 80 },
    { "personaId": "security",     "enabled": true, "mode": "always",      "priority": 90 },
    { "personaId": "database",     "enabled": true, "mode": "conditional", "priority": 70,
      "trigger": { "pathGlobs": ["prisma/schema.prisma", "**/migrations/**"] } },
    { "personaId": "teacher",      "enabled": true, "mode": "manual",       "priority": 40 }
  ],
  "quality": { "lint": true, "typecheck": true, "tests": true, "securityScan": true,
               "reviewBeforeCompletion": true },
  "policyVersion": 7
}
```

### Session persona state

Replace the single `personaId` with a set (the single field stays as a
back-compat read):

```ts
interface SessionPersonaState {
  alwaysOnPersonaIds: string[];   // resolved from project at session creation
  manualPersonaIds: string[];     // added via @mention this session
}
```

### Policy (new) — project rules, not behaviour

```yaml
typescript:   { strict: true, noAny: true }
testing:      { required: true, requiredForBusinessLogic: true }
security:     { inputValidation: required, noSecretsInSource: true }
architecture: { preserveExistingPatterns: true }
quality:      { reviewBeforeCompletion: true }
```

A persona *says* "act like a senior engineer". A policy *says* "all API input
uses Zod". Policy is deterministic and enforceable; persona is guidance.

## II.2 Resolution modes

| Mode | Meaning | Activation |
|---|---|---|
| `always` | in every applicable task's context | automatic, at session creation |
| `manual` | no effect until invoked | `@Teacher` in the composer |
| `review` | runs *after* relevant work, on the diff | quality orchestrator |
| `conditional` | runtime activates by change type | change classifier matches a trigger |

`@mention` is **session-scoped** by default. Offer an explicit
"@Teacher → Make always active" that writes it into project config.

### Conditional example

```
Code Quality → always        Security → conditional (auth files)
Database     → conditional    Teacher  → manual
             (schema/migrations)

agent edits src/auth/login.ts   → Code Quality ✅  Security ✅  Database ❌
agent edits prisma/schema.prisma → Code Quality ✅  Security ❌  Database ✅
```

Cuts token cost while keeping the right expertise in scope.

## II.3 Persona Resolver → Context Composer → Task Snapshot

```
Persona Store
     │
Project Settings ── always / manual / conditional
     │
     ▼
Persona Resolver          validate → dedupe → sort by priority → resolve conflicts
     │
     ▼
Effective Personas + Policies + Skills catalog + Workspace
     │
     ▼
Context Composer          one <project-context> block (see II.4)
     │
     ▼
Task Snapshot             { personaIds+versions, policyVersion, skillSnapshot }
     │
     ▼
Agent Harness (adapter)   Goose | ClaudeCode | Codex  → Model
```

The resolver is an orchestration layer, **not** `p1 + p2 + p3`. Priority
ordering (Security 100 > Correctness 90 > Architecture 80 > Code Quality 70 >
Performance 60 > Docs 40); on conflict, higher priority wins.

### Instruction hierarchy (deterministic, top wins)

```
Platform / system rules
  > Security / hard policies
  > Project policies
  > Persona instructions
  > Skill instructions
  > User request
```

Personas must never override platform safety or project hard policies.

## II.4 The composed context

Extends today's `composeSystemPrompt` (Part I §4.1):

```xml
<project-context>
  Project: Fish Marketplace

  <active-personas>
    <persona name="Security Engineer" priority="90"> … </persona>
    <persona name="Senior Code Quality Engineer" priority="80"> … </persona>
    <persona name="Testing Engineer" priority="70"> … </persona>
  </active-personas>

  <project-policies>
    - TypeScript strict, no `any`
    - Tests required for business logic
    - Input validation required (Zod)
    - No secrets in source
    - Preserve project architecture
  </project-policies>

  <workspace> … </workspace>
  <available-skills> … </available-skills>
</project-context>

USER: Add login with email and password.
```

Delivery is unchanged from Part I §4.2: Goose gets it via the system-prompt
extension; external agents get a one-time handoff block. Formalise this as:

```ts
interface AgentHarness {
  send(session: Session, context: ExecutionContext, message: string): Promise<void>;
}
// GooseHarness · ClaudeCodeHarness · CodexHarness — each delivers differently
```

The runtime produces one `ExecutionContext` and does not care which harness
consumes it.

## II.5 Runtime-enforced quality — the gate is not the LLM

An LLM told "always review code" will not always review code. Enforcement lives
**outside** the model.

```
agent tool call (write_file / edit_file / apply_patch)
     │
Runtime observer → Change Classifier
     │  isFileMutation && isSourceCodeFile(path)   (.ts .tsx .py .go .rs .sql Dockerfile …)
     ▼
task.codeModified = true  → quality gates now REQUIRED
     │
     ▼
Quality Orchestrator — run project's enabled gates
   ┌───────────┬───────────┬──────────────┬───────────────┐
   ▼           ▼           ▼              ▼               ▼
 Typecheck    Lint       Tests        Security scan   Review persona (on the diff)
   │           │           │              │               │
   └───────────┴─────┬─────┴──────────────┴───────────────┘
                     ▼
              Quality Decision
                ┌────┴────┐
              FAIL       PASS
                │          │
      Repair loop:         Done
      feed agent {failing gate, file, message},
      agent fixes → re-run gates → re-review,
      until PASS or failure budget exhausted.
```

The task is **not complete** while a required gate fails.

### Review persona inspects the diff, not the repo

Give the reviewer: `git diff` + changed files + test results + lint results +
project policy + persona instructions. Ask for: correctness, security,
maintainability, performance, testing, architecture. Never re-scan the whole
tree per task.

### Persona vs enforcement are independent

A project may run `Code Quality persona: OFF` but `lint/tests/securityScan: ON`.
Persona = behavioural guidance; quality gate = execution enforcement. If the
user turns the Code Quality *capability* off, disable its review gate too —
don't leave enforcement running after the capability is off.

## II.6 Snapshots & versioning

- **Config changes affect future tasks, not running ones.** Snapshot persona +
  policy + skill selection at enqueue time (Part I §4.1 already does this for
  the persona system prompt — keep and extend it).
- **Version everything a task used:**

```jsonc
task_execution: {
  taskId: "…",
  personaSnapshot: [ { personaId: "code-quality", version: 4 },
                     { personaId: "security",     version: 3 } ],
  policySnapshot: { version: 7 },
  skillSnapshot: [ … ],
  status: "done",
  qualityStatus: "passed"
}
```

So "why did the agent behave this way on task #1827?" is answerable.

## II.7 UI surface

Transcript header shows the resolved set:

```
Project: Fish Marketplace
Always-on: ✓ Code Quality  ✓ Security  ✓ Testing
Session:   Teacher (manual, this session)
```

Later: "why was this rule applied?" → trace each instruction back to its source
(Code Quality persona / project policy / security persona).

Project settings screen:

```
PROJECT AGENTS
  Default Agent            Claude Code
  Always Active Personas   ✓ Senior Code Quality  ✓ Security Engineer  ✓ Testing Engineer
  Manual Personas          Teacher · System Design · Performance
  Conditional Personas     Database (schema/migrations)
  Quality Enforcement      ✓ Lint  ✓ Typecheck  ✓ Tests  ✓ Security Scan  ✓ Review Before Completion
  Policies                 TS strict · no `any` · input validation required · tests for business logic
```

### Empty case

No personas selected → `activePersonas = []`. Agent gets policy + workspace +
skills + user request. **No hidden persona.** This is the guarantee: only
selected personas affect the project.

## II.8 Data model

```
projects(id, name, default_harness, default_model, policy_version)
personas(id, name, description, system_prompt, provider, model, role, priority, version)
project_personas(project_id, persona_id, enabled, mode, priority, trigger_json,
                 created_by, created_at, updated_at)          -- table, not JSON blob
project_policies(project_id, policy_json, version)
sessions(id, project_id)
session_personas(session_id, persona_id, source)              -- source: project_always_on | manual
task_execution(task_id, persona_snapshot, policy_snapshot, skill_snapshot,
               status, quality_status)
```

`project_personas` is a relation table (not an `activePersonaIds` array) so
mode/priority/trigger/audit columns can grow without a redesign.

## II.9 Core contracts

1. Personas live independently from projects.
2. A project explicitly selects which personas it enables.
3. `always` = automatically active for applicable new tasks.
4. `manual` = no effect until explicitly invoked.
5. `conditional` = runtime activates it by task/change type.
6. A project can have multiple active personas.
7. Persona priority resolves conflicts.
8. Project policies are separate from personas.
9. Skills are separate from personas.
10. The effective persona set is resolved before execution.
11. Only the resolved personas are sent to the agent.
12. The execution context is snapshotted per task.
13. Config changes affect future tasks, not running tasks.
14. Code-changing tool calls can trigger external quality enforcement.
15. Quality enforcement must not rely on the LLM following instructions.
16. Reviewer personas inspect the resulting diff + validation results.
17. Failed quality checks create a repair loop.
18. A task is not complete while required gates fail.
19. No persona selected → no hidden persona applied.
20. The agent runtime and the persona system stay separate.

## II.10 Full task lifecycle — "Add password reset"

```
USER "Add password reset"
   │
PROJECT load config
   │
PERSONA RESOLVER → always(Security, Code Quality, Testing) + conditional(none yet) + manual(none)
   │
CONTEXT COMPOSER  personas + policy + skills catalog + workspace
   │
TASK SNAPSHOT     persona versions + policy version
   │
AGENT HARNESS → MODEL → planning → tool calls → code edit
   │
CHANGE CLASSIFIER  src/auth/*  → codeModified=true, Security stays active
   │
QUALITY GATE   typecheck · lint · tests · security scan
   │                 │
   │            REVIEW PERSONA on git diff
   │                 │
   ├── FAIL → feed findings to agent → fix → re-run ─┐
   │                                                 │
   └── PASS ────────────────────────────────────────┴─→ TASK COMPLETE
```

---

## File map for this slice

| Concern | File |
|---|---|
| Mention detection / scoring | `features/chat/ui/mentionDetection.ts` |
| Mention menu UI | `features/chat/ui/MentionAutocomplete.tsx` |
| Mention wiring + selection handlers | `features/chat/hooks/useMentionHandlers.ts` |
| `@` default category preference | `features/chat/lib/mentionPreference.ts` |
| Persona type | `shared/types/agents.ts` |
| Persona loading | `features/agents/hooks/usePersonas.ts`, `stores/agentStore.ts` |
| Persona → harness/model | `features/agents/lib/personaExecutionTarget.ts` |
| Session controller (persona change, send) | `features/chat/hooks/useChatSessionController.ts` |
| System-prompt composition | `features/projects/lib/chatProjectContext.ts` |
| Skills catalog prompt | `features/skills/lib/skillChatPrompt.ts` |
| ACP send + preamble keys | `shared/api/acp.ts` |
| External-agent persona handoff | `shared/api/acpPersonaHandoff.ts` |
| Direct ACP calls | `shared/api/acpApi.ts`, `acpConnection.ts` |
| Streaming updates → store | `features/chat/acp/acpNotificationHandler.ts`, `liveStreamingUpdates.ts` |
| Bundled persona seeding | `src-tauri/src/services/bundled_agents.rs` |
| Bundled skill seeding | `src-tauri/src/services/bundled_skills.rs` |
| Agent-builder session flow | `features/agents/lib/agentBuilderSession.ts`, `hooks/useAgentBuilderCoordinator.ts` |
| `goosed` spawn/own/kill | `src-tauri/src/services/acp/goose_serve.rs` |
| Bridge install (claude/codex) | `src-tauri/src/services/managed_acp_tools.rs` |
