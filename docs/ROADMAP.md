# Roadmap — design verdict and product tiers

*Status doc. What the design gets right, what to change, and what ships at each
product tier.*

**Tier detail:** [V1](V1.md) · [MVP](MVP.md) · [V2](V2.md) · [V3](V3.md) ·
[V4](V4.md)
**Also:** [ARCHITECTURE](ARCHITECTURE.md) · [LADDER](LADDER.md) ·
[FINDINGS](FINDINGS.md)

```
V1    Single-agent engineering workspace          ← V1.0 shipped, V1.1 in progress
 ↓
MVP   Basic parallel multi-agent execution
 ↓
V2    Intelligent coordinated multi-agent system
 ↓
V3    Production-grade autonomous engineering platform
 ↓
V4    Distributed / team / cloud platform
```

> **Naming.** The product is **Weave**. The code is not renamed yet: packages
> are `@berd/*`, the CLI is `berd`, runtime output is `.berd/`. Every command
> and path in these docs is the real one. The rename is tracked in
> [LADDER](LADDER.md) under V1.1.

---

## 0. Verdict

**The approach is right.** Two corrections in the design are the ones that
matter, and both are already in it:

> One agent by default. Split only when parallelism has real benefit.

> A dependency is not a full stop. Split the task instead.

Together they kill the two failure modes that sink most multi-agent coding
systems: spawning workers because you can, and idling three of them behind one.

Three caveats:

1. **It is a V3 vision written against a V1 codebase.** ~58 design sections,
   ~6 of them implemented. Fine as a destination, dangerous as a backlog.
   Everything below assigns each section to a tier.
2. **Measurement is half-built.** The parallelism decision, routing by
   historical success, and adaptive worker counts all consume data the system
   does not yet collect. The harness landed in `f31b854`; what it still cannot
   record is *verification strength*, which is the field most of those readers
   need.
3. **A few sections specify infrastructure heavier than the problem.**
   Corrected in §2 and §3.5.

**Rating:** design quality 9.5/10, buildability as written 5/10. The gap is
sequencing and measurement, not ideas.

**The tier rule:** every tier is independently usable. If you stop at the end of
any one, you have a product someone could run — not a half-built version of the
next one. Defend that when a V3 idea looks tempting during MVP.

---

## 1. The four scenarios are the real spec

This is the most useful part of the design, because it is the only part written
from the user's side rather than the system's. Everything else is judged
against it.

| | Simple | Complex |
|---|---|---|
| **New** | blueprint → 1 worker → build → smoke | blueprint → contracts → N workers → integrate → smoke |
| **Existing** | context → retrieve → 1 worker → verify | context → impact → DAG → N workers → dynamic deps → integrate → verify |

Two things follow that the ladder did not previously reflect:

**Greenfield is a first-class path, not an edge case.** If the target user
builds products by prompting, most first runs have no repository to understand,
no tests to run, and no code graph to walk. Half the intelligence layer —
context model, impact analysis, incremental updates — simply does not apply on
the first run of a new project. The lightweight-blueprint path is the one that
gets exercised most.

**The greenfield paths are the riskiest, not the safest.** No tests means no
regression net; contract drift between four workers is caught by nothing except
typecheck and a smoke run. So the *simpler-looking* scenarios need the
*stronger* verification story. That is what contracts and the smoke ladder exist
for, and it is why both move earlier than they otherwise would.

---

## 2. What is right and should not be touched

| Idea | Why it holds |
|---|---|
| Adaptive worker count; smallest number that works | The core insight. Everything else serves it. |
| Lightweight blueprint for greenfield, not full docs | Documenting code that doesn't exist yet is pure waste. |
| Contract-first for parallel greenfield | The only thing preventing four workers from inventing four API shapes. |
| Dependency ≠ full stop; split into T3a/T3b | The correction that makes parallelism actually pay. |
| Structured model = truth, vectors = retrieval | RAG cannot answer "which service owns `/api/payment`". |
| Incremental context updates, never full rescan | Full rescan per edit would dominate cost. |
| Tool-output compression | Failing tests are the largest token sink, on the path where retries multiply. |
| Local process tracking now, leases at V4 | Correct. Heartbeats between a parent and its own children is ceremony. |
| Event bus as a reader over the ledger first | Avoids a second infrastructure system for zero gain. |
| Sequential integration, verify after each merge | The only merge strategy that names the culprit. |
| Infrastructure is the security boundary, never the LLM | Non-negotiable. Already true in the two-boundary design. |
| Execution ledger | Built, and earned at V1.0 instead of late. |
| `NO_CHANGE_NEEDED` as a valid successful outcome | Rare in these designs and genuinely important. |

---

## 3. Where the design changes

### 3.1 "No tests" must never mean "refuse" — build the verification ladder

This is the correction with the widest blast radius.

A repo with no test suite still has verifiable behaviour. Weave should walk down
a ladder and use the strongest rung the project actually supports:

```
1  tests            pnpm test            (if a test script exists)
2  typecheck        tsc --noEmit         (if tsconfig exists)
3  lint             eslint               (if configured)
4  build            next build / tsc     (almost always available)
5  boot             process starts and stays up N seconds
6  health           docker compose up --wait; GET /health → 200
7  smoke            scripted request flow
8  diff review      structural sanity: no deleted exports, no orphan files
```

Rules:

- **Never refuse a repo for having no tests.** Detect the rungs, record which
  are available in the project model, and report the verification strength used
  on every run.
- **Verification strength is a first-class field** on `TaskResult` and in the
  ledger. A pass at rung 5 is not a pass at rung 1, and the eval harness must
  not average them together.
- **Offer, never impose.** If only rungs 4–5 exist, Weave may propose a
  bootstrap task that adds a smoke script. It runs only if the user accepts.
- For greenfield, the smoke flow *is* the acceptance test, and the planner
  generates it from the blueprint at plan time — not after the code lands, when
  it becomes a rationalisation of whatever was built.

```ts
type VerificationRung = "tests" | "typecheck" | "lint" | "build"
                      | "boot" | "health" | "smoke" | "diff-review";

type Verification = {
  available: VerificationRung[];   // detected at intake
  used: VerificationRung[];        // actually run
  strength: number;                // 1 (weakest) … 8, for eval bucketing
};
```

Today the harness takes a single `verify` string per fixture and knows nothing
about strength. `packages/eval/fixtures/tasks.json` hardcodes
`node --test tests/*.test.js`. That is rung 1 by hand, not a detected ladder.

### 3.2 Contracts need an owner and a change protocol

Putting the contract package in every worker's `readOnlyPaths` is necessary but
not sufficient: a worker blocked from editing the contract will work around it
locally instead, and you get drift without an edit.

Make the protocol explicit:

```
Worker: CONTRACT_CHANGE_REQUEST { from, to, reason, affects[] }
   ↓
Orchestrator: impact check — who else reads this symbol?
   ↓
Apply to contracts/, bump context version
   ↓
Delta to affected workers (a prompt turn)
   ↓
Where the delta invalidates work already done: cancel + re-run that task
```

The contract is owned by the orchestrator, not by any worker. Requesting a
change is a normal, expected event — not an error path.

Keep the contract small. The temptation is to make it a full spec; then
generating it becomes the critical path and every worker waits on it.

> **Which `packages/contracts/`?** The one Weave *generates inside the target
> repo*, not a new workspace member here. Weave's own code for it is
> `packages/core/src/contracts.ts`. This matters: "a new version adds a file to
> an existing package" still holds.

### 3.3 The parallelism decision needs data that does not exist yet

```
parallel benefit = serial time − parallel time − coordination overhead
```

Every term is unmeasured today. Estimating with an LLM produces confident
numbers unrelated to reality.

- **MVP heuristic, existing repos:** split only if the plan has ≥3 tasks whose
  `allowedPaths` are pairwise disjoint and each has a runnable verification
  rung. Otherwise one worker.
- **MVP heuristic, greenfield:** split along declared components (frontend /
  api / worker / infra) once a contract exists. Component boundaries are cheap
  and honest here, because there is no existing coupling to discover.
- **V3, from ledger data:** measured medians per task category. The formula
  stays; the inputs finally exist.

Same for routing by history and adaptive worker count.

### 3.4 Smaller per-task context is a real benefit — but not exclusive to parallelism

This changes the MVP gate, so it is worth being precise about.

Splitting work into scoped tasks does shrink each model call's context, and
smaller context usually means better adherence and fewer wrong-file edits. That
benefit is real and it is **independent of running the tasks at the same time**.

Which means: three scoped tasks run *sequentially* by one worker may already
capture most of the quality win, at none of the coordination cost. The MVP
experiment therefore needs a third arm, not two:

```
A  one agent, one prompt, whole repo context
B  planner splits into tasks, ONE worker runs them sequentially
C  planner splits into tasks, N workers run them in parallel
```

If B ≈ C on correctness and B is cheaper, the product is **scoped
decomposition**, and parallelism is an optional accelerator. That is still a
good product — arguably an easier one to ship. If C clearly beats B on wall
clock at equal correctness, parallelism is the product. Either answer is worth
knowing before building V2's coordination machinery, and only the harness can
tell you.

### 3.5 Storage — keep it local through V3

Postgres + pgvector + Redis is right for V4 and wrong before it, for the reason
[FINDINGS](FINDINGS.md) already recorded: one user, one machine, no shared
state, no repeated expensive read.

| Need | Through V3 | V4 |
|---|---|---|
| Event history | `.berd/runs/*/events.ndjson` (built) | same, plus shipping |
| Task / run state | SQLite `.berd/state.db` | Postgres |
| Worker liveness | in-process registry + child `exit` | heartbeats + leases + fencing |
| Locks / ownership | in-memory map in `core` | Redis |
| Vector index | `sqlite-vec` or a flat file | pgvector |

Design the interfaces now — every write carries a `leaseId`, every worker has an
id independent of its process — and implement none of it until a worker runs
somewhere you cannot watch it exit.

### 3.6 Semantic conflict detection stays unambitious

"Semantic merge" is not buildable. What is buildable is the verification ladder
applied after each merge. Merge T1 → verify → merge T2 onto that → verify →
stop at the first failure and name the task that broke it. ~200 lines. Anything
smarter is a research project pretending to be a milestone.

### 3.7 Still missing

| Gap | Why it matters | Tier | Status |
|---|---|---|---|
| **Variance handling** | Agent runs are nondeterministic; N=1 per cell is noise | V1.1 | ✅ shipped — `repeats`, default 3 |
| **Cheat resistance** | "Does `verify` pass" is passable by editing the test | V1.1 | 🟡 half — restore works, `readOnlyPaths` is not enforced |
| **Verification strength in scoring** | A rung-5 pass and a rung-1 pass are not the same result | V1.1 | ❌ not started |
| **Environment cold-start** | Most repos don't install and build in a fresh worktree first try | MVP | ❌ |
| **Sequential-decomposition arm** | Without it you cannot attribute the win to parallelism | MVP | ❌ |
| **Blueprint drift** | Greenfield plans go stale mid-build; nothing re-checks the blueprint | MVP | ❌ |

### 3.8 Two edits to the principles

- Add: **Measure before adding a component.** Already how this project works —
  Redis, the profiling finding — and it is what keeps the design from becoming
  its own diagram.
- Amend "integrate only after validation" to **"integrate sequentially,
  verifying after each merge."** The order is the mechanism.

---

## 4. Task state machine

```
PLANNED ──► READY ──► RUNNING ──► VERIFYING ──► DONE
                │         │            │
                │         ├──► WAITING ─┘        (dependency not yet satisfied)
                │         ├──► BLOCKED           (resource owned by another task)
                │         ├──► TIMEOUT
                │         ├──► FAILED ──► RECOVERABLE ──► READY
                │         └──► NO_CHANGE_NEEDED  (terminal, successful)
                └──► CANCELLED
```

Notes:

- `NO_CHANGE_NEEDED` is **terminal and successful**. It must never be scored as
  a failure, and the planner must be able to emit it too — "the described bug
  does not exist" is a valid plan result.
- `TIMEOUT` stays distinct from `FAILED`; they demand different responses.
- `RECOVERABLE` is set by the supervisor after classifying a failure, not by
  the worker.
- Every transition is a ledger event. The state machine is a projection over the
  ledger, not separate state to keep in sync.

**Today:** `TaskStatus` in `packages/protocol/src/task.ts` is
`pending | running | ok | failed | cancelled`. The runner already distinguishes
a tripped cap (`cancelled` + a `task.timeout` event), and the harness maps that
to a `timeout` cell status — so `TIMEOUT` exists in effect but not in the type.
The full machine lands with the scheduler at MVP.1.

---

## 5. Tier map — what each one has to prove

The tier rule again: every tier is independently usable. So each one is defined
by the thing it has to demonstrate, not by the code it contains.

| Tier | Name | What it has to prove |
|---|---|---|
| [V1](V1.md) | Single-agent engineering workspace | The matrix reports **per verification rung**, unattended. Without this, everything later is taste. |
| [MVP](MVP.md) | Basic parallel multi-agent execution | N workers match 1 worker on **pass rate** at equal rung. If not, ship the sequential version. |
| [V2](V2.md) | Intelligent coordinated multi-agent | The fixture matrix improves on MVP **for large-repo fixtures**. |
| [V3](V3.md) | Production-grade autonomous platform | Measured routing beats a fixed strongest-model config **on cost at equal pass rate**. |
| [V4](V4.md) | Distributed / team / cloud | Nothing yet. Gated on a worker running somewhere you cannot watch it exit. |

Two of those are real forks. V1's gate blocks MVP from starting. **MVP's gate
can cancel most of V2** — that is the one to take seriously.

---

# The five tiers

Each tier has its own file with the full detail — files, acceptance criteria,
edge cases, and what it deliberately does *not* do. This section is the
one-paragraph version of each.

## [V1 — Single-agent engineering workspace](V1.md)

One agent, one repo, safely, with a complete record and a verification story
that works even when the repo has no tests. **No orchestration.** Shippable on
its own as an engine-agnostic agent frontend with an audit trail.

- **V1.0 ✅ shipped** (`278bf8a`) — runner, ledger, permissions, two confinement
  boundaries, engine registry, desktop app.
- **V1.1 🟡 in progress** — the harness half shipped in `f31b854` (repeats,
  isolation, anti-cheat restore, caps, `noop-trap`, cost capture). Still to
  build: intake, the verification ladder, 12 fixtures, three unenforced fields,
  a verified non-Claude engine, the `berd` → `weave` rename.
- **Exit:** `berd eval` runs 12 fixtures × ≥2 configs × ≥3 repeats unattended
  and reports **per verification rung**.

## [MVP — Basic parallel multi-agent execution](MVP.md)

Several agents on one machine, isolated in worktrees, on a plan you can inspect,
merged sequentially with verification — on both new and existing projects. **The
actual pitch.**

- **MVP.1** worktrees · pool · scheduler · integrator · compression. Cancellation
  and cold-start measurement land here.
- **MVP.2** planner · blueprint · contracts · `decide`. `CONTRACT_CHANGE_REQUEST`
  is implemented here, not deferred.
- **MVP.3** lanes in the UI — `useAcpChat` becomes a map keyed by `taskId`.
- **Exit:** the three-arm experiment. Ship parallel only if C matches A and B on
  pass rate at equal verification rung.

## [V2 — Intelligent coordinated multi-agent system](V2.md)

Agents that share knowledge, avoid each other by construction, and receive only
the context they need. MVP parallelises; **V2 makes parallelising safe on a
monorepo.** Gated on MVP's experiment — if arm B wins, most of this tier should
not be built.

- **V2.1** ownership (file *and* module) · event bus over the ledger · dynamic
  dependencies.
- **V2.2** `context/` — deterministic scan first, structured model as truth,
  vectors for retrieval, incremental versioned updates.
- **V2.3** the full dashboard.
- **Exit:** impact analysis is correct, context updates in seconds, contention
  resolves without corruption, a discovered dependency reorders without a
  restart, and the fixture matrix improves on MVP for large repos.

## [V3 — Production-grade autonomous platform](V3.md)

It decides how much to spend, recovers from its own failures, and knows when to
ask a human. **Everything in V3.1 is a reader over V1 and MVP data** — it cannot
be built earlier.

- **V3.1** routing by measured history · budgets as denials · adaptive worker
  count · critical path.
- **V3.2** supervisor driven by a failure taxonomy · checkpoints · risk policy ·
  replay.
- **V3.3** per-worker sandbox policy · the ladder extended to security, audit,
  performance and migration validation.
- **Exit:** measured routing beats a fixed strongest-model config on cost at
  equal pass rate; a killed worker is detected, released, resumed or replanned,
  legibly in the ledger.

## [V4 — Distributed / team / cloud](V4.md)

Workers the orchestrator cannot see die, and more than one human. Remote
workers, leases with expiry, fencing tokens, Postgres, Redis, multi-user.

**Unlocked by exactly one condition:** a worker runs somewhere you cannot watch
it exit. Until then, leases are ceremony. Realistically a company, not a
milestone — do not let its requirements leak into V2.

---

## 6. The rules

1. One agent by default; split only when it has real benefit.
2. **Measure before adding a component.**
3. Never refuse a project for lacking tests — verify at the strongest rung it
   supports, and record which one.
4. Dependencies are fine-grained: split the task, don't stop it.
5. Contracts are owned by the orchestrator; changing one is an event, not an edit.
6. Never rely on agents to avoid conflicts themselves.
7. Enforce ownership outside the LLM.
8. Give every worker isolated execution.
9. Share project knowledge, not write access.
10. Update context incrementally, and version it.
11. Retrieve only relevant context; compress tool output.
12. Budget tokens and money per task.
13. Route by measured evidence, not taste.
14. Scale worker count to actual workload.
15. Re-plan when reality diverges from the plan.
16. Never blindly retry — classify the failure first.
17. **Integrate sequentially, verifying after each merge.**
18. `NO_CHANGE_NEEDED` is a success.
19. Infrastructure is the security boundary, never the model.
20. Keep a complete execution ledger, always, never optional.

---

## 7. Open risks

| Risk | Mitigation |
|---|---|
| Parallelism adds nothing over sequential decomposition | The three-arm MVP experiment is the go/no-go. Arm B is the one that could quietly win. |
| Greenfield runs pass verification and still produce broken software | Smoke flow generated at plan time from the blueprint, never after the fact. |
| Contract drift between workers on a new codebase | `CONTRACT_CHANGE_REQUEST` implemented in MVP.2, not deferred to V2. |
| Environment cold-start dominates wall clock | Measured separately from agent time starting in MVP.1. |
| Engine registry rows never verified | Verify one non-Claude engine in V1.1, before V3 assumes a choice exists. |
| Fields documented as enforced but read by nothing | Three found already — see [V1](V1.md) and [FINDINGS](FINDINGS.md). Grep before trusting a doc comment; the ledger is the only thing that cannot lie. |
| Scope: ~58 design sections, one person | V1 and MVP are the product. V2–V4 are refinements to something that already works. |
| Overlap with Cortex | Decide explicitly whether Weave is Cortex's execution backend or a separate product. Deciding by accident is the expensive path. |

---

## Appendix — design-section → tier

The source design doc numbers its ~58 sections. Kept here so a reference to
"§40" in that document resolves to a tier in this one.

| Tier | Design sections |
|---|---|
| V1 | 2, 3, 13 (partial), 14, 17, 18, 41, 42, 43, 44, 45, 46, 48 |
| MVP | 4–10, 15, 16, 25, 31, 39, 40, 49, 50 |
| V2 | 11–13, 19–24, 27, 32, 34, 35, 51 |
| V3 | 28, 29, 30, 36, 37, 38, 52 |
| V4 | 33 (distributed half), 53 |

The ones cited most often above: §4 lightweight blueprint · §7 contracts ·
§8 contract read-only paths · §13 deterministic analysis first · §16/§56
dependency-splitting · §17 task states · §19 structured model vs vectors ·
§22 incremental context · §23 privileged context updater · §25 tool-output
compression · §27 context deltas as prompt turns · §28 routing by history ·
§30 adaptive worker count · §32 module-level ownership · §33 process tracking
vs leases · §34 event bus over the ledger · §37 failure taxonomy · §39
sequential integration · §40 smoke ladder · §41 infrastructure as the security
boundary · §42 cancellation · §43 execution ledger · §44–45 the harness ·
§46 `NO_CHANGE_NEEDED` · §47 the four scenarios · §49 lanes UI · §53 V4 storage
· §57 smallest worker count that works.
