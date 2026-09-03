# MVP — Basic parallel multi-agent execution

**Definition:** several agents on one machine, isolated, on a plan you can
inspect, merged sequentially with verification — on **both** new and existing
projects.

**Shippable as:** the actual pitch. Everything after this makes it smarter, not
newly possible.

**Status:** not started. Blocked on [V1](V1.md)'s exit criteria — without the
baseline table, the three-arm experiment at the end of this tier has nothing to
compare against.

Tier context: [ROADMAP](ROADMAP.md) · previous: [V1](V1.md) · next: [V2](V2.md)

---

## The four cases the tier has to handle

| | Simple | Complex |
|---|---|---|
| **New** | blueprint → 1 worker → build → smoke | blueprint → contracts → N workers → integrate → smoke |
| **Existing** | context → retrieve → 1 worker → verify | context → impact → DAG → N workers → dynamic deps → integrate → verify |

**Greenfield is a first-class path, not an edge case.** Most first runs have no
repo to understand, no tests to run, and no code graph to walk. The
lightweight-blueprint path is the one that gets exercised most.

**And it is the riskiest, not the safest.** No tests means no regression net;
contract drift between four workers is caught by nothing except typecheck and a
smoke run. The simpler-looking scenarios need the stronger verification story —
which is why contracts (MVP.2) and the smoke rungs ([V1](V1.md)'s ladder) both
move earlier than they otherwise would.

---

## MVP.1 — worktrees, pool, integration

```
packages/core/src/worktree.ts     create · install · harvest diff · destroy
packages/core/src/pool.ts         spawn per task, concurrency cap, crash detect
packages/core/src/scheduler.ts    hand-written DAG → ready set
packages/core/src/integrator.ts   merge one, verify, next
packages/core/src/compress.ts     tool-output compression
packages/protocol/src/task.ts     allowedPaths / readOnlyPaths enforced
```

### Worktrees

Under `.berd/worktrees/<taskId>/`. The sandbox story survives unchanged:
*"agent confined to the project folder"* becomes *"agent confined to its
worktree"* for free.

**This is the real answer to the vacuous-permission gap.** Many tool calls
report no `locations` at all — a shell command, for instance — so the policy has
nothing to inspect and allows unconditionally. Inspection is not containment.
A worktree is containment.

**Budget a full day for edge cases:**

| Edge case | Why it bites |
|---|---|
| Dirty main | `git worktree add` from an unclean tree carries surprises into every worker |
| Branch collisions | Two runs, same task id, same branch name |
| `node_modules` per worktree | The pnpm store helps; it does not eliminate the install |
| Crashed agent leaves a worktree locked | `git worktree prune` needs to be part of teardown, not a manual step |
| The copy-vs-symlink trap | Already measured in [FINDINGS](FINDINGS.md): symlinking `node_modules` breaks workspace monorepos. Do not retry it here. |

### Cancellation

Kill workers, release claims, destroy worktrees, mark tasks `CANCELLED` in the
ledger. This lands here rather than later because N unattended agents with no
stop button is not shippable.

### Cold-start measurement

**Install time per worktree is recorded separately from agent time.** Otherwise
it hides inside the wall clock and gets misattributed to the model — the same
class of error as the `/private/var` incident, where a harness bug read as
"Sonnet is worse at this".

This is also an open risk in its own right: most repos do not install and build
in a fresh worktree on the first try.

### Integration

**Sequential, verified after each merge.** Merge T1 → verify → merge T2 onto
that → verify → stop at the first failure and name the task that broke it.

That *is* the whole of "semantic conflict detection". Semantic merge is not
buildable; this is ~200 lines and names the culprit. Anything smarter is a
research project pretending to be a milestone.

Verification uses the strongest available rung from [V1](V1.md)'s ladder, and
records which one.

### Tool-output compression

Failing tests are the largest token sink, and they sit on the path where retries
multiply. Compressing tool output is not an optimisation here — it is what keeps
a retrying worker from eating its own context window.

### Acceptance

3 tasks with no overlapping files run concurrently in separate worktrees and
merge cleanly, with the ledger showing which task touched what.

---

## MVP.2 — planner, decomposition, blueprint

```
packages/core/src/planner.ts      prompt + project facts → TaskContract[]
packages/core/src/blueprint.ts    greenfield: stack, components, API, events
packages/core/src/contracts.ts    generate the target repo's contracts, own changes
packages/core/src/decide.ts       one worker or several?
packages/protocol/src/task.ts     dependencies: { task, requiredOutputs }[]
```

### The blueprint (greenfield only)

Stack, components, initial API, initial event contracts. **And nothing more.**
Documenting code that does not exist yet is pure waste.

Open risk: **blueprint drift.** Greenfield plans go stale mid-build and nothing
re-checks the blueprint. Not solved at this tier — recorded so it is not
discovered as a surprise.

### Contracts, and who owns them

Putting the contract package in every worker's `readOnlyPaths` is necessary but
**not sufficient**: a worker blocked from editing the contract works around it
locally instead, and you get drift without an edit.

So the change protocol is explicit:

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

**The contract is owned by the orchestrator, not by any worker.** Requesting a
change is a normal, expected event — not an error path.

Implemented **here**, not deferred to [V2](V2.md): with four workers on a new
codebase it fires on the first real run.

Keep the contract small. The temptation is to make it a full spec; then
generating it becomes the critical path and every worker waits on it.

> **Which `packages/contracts/`?** The one Weave *generates inside the target
> repo*. Weave's own code for it is `packages/core/src/contracts.ts`. This
> matters: "a new version adds a file to an existing package" still holds.

### Dependencies are fine-grained

`dependencies: { task, requiredOutputs }[]` — carrying `requiredOutputs` is what
makes the T3a/T3b split expressible.

> **A dependency is not a full stop. Split the task instead.**

If T3 needs one symbol from T1, T3 does not wait for all of T1. Split T3 into
the part that needs the symbol and the part that does not. This is one of the
two corrections that make parallelism actually pay — the other being "one agent
by default".

### `decide.ts` — one worker or several?

The real formula needs data that does not exist yet:

```
parallel benefit = serial time − parallel time − coordination overhead
```

Every term is unmeasured. Estimating with an LLM produces confident numbers
unrelated to reality. So at this tier it is a **heuristic**, and it is honest
about being one:

| Case | Heuristic |
|---|---|
| **Existing repo** | Split only if the plan has ≥3 tasks whose `allowedPaths` are pairwise disjoint **and** each has a runnable verification rung. Otherwise one worker. |
| **Greenfield** | Split along declared components (frontend / api / worker / infra) once a contract exists. Component boundaries are cheap and honest here, because there is no existing coupling to discover. |

[V3.1](V3.md) replaces the heuristic with measured medians per task category
from ledger data. The formula stays; the inputs finally exist.

### Acceptance

One prompt produces a task graph the MVP.1 scheduler runs unedited, on both a
greenfield and an existing-repo fixture.

---

## MVP.3 — lanes in the UI

`useAcpChat` is one transcript today. It becomes a **map keyed by `taskId`**.

That single change is what turns the chat window into a multi-worker view — and
it is a reader over the existing ledger, not a second stream, because every
event already carries `taskId`.

Add: a lane per worker, a plan view, live cost. Nothing else from the full
dashboard yet — that is [V2.3](V2.md).

---

## Exit criteria for MVP — the three-arm experiment

**This is the gate, and it is a real go/no-go.** Run on the [V1](V1.md)
fixtures:

```
A  one agent, one prompt, whole repo context
B  planner splits into tasks, ONE worker runs them sequentially
C  planner splits into tasks, N workers run them in parallel
```

### Why arm B exists

Splitting work into scoped tasks shrinks each model call's context, and smaller
context usually means better adherence and fewer wrong-file edits.

**That benefit is real, and it is independent of running the tasks at the same
time.**

So three scoped tasks run sequentially by one worker may already capture most of
the quality win, at none of the coordination cost. Without arm B you cannot
attribute the win to parallelism — you would ship a scheduler to buy something a
loop already gave you.

### The decision

**Ship parallel only if C matches A and B on pass rate at equal verification
rung.** Faster and less correct is a failure.

| Outcome | What it means |
|---|---|
| **C > B** on wall clock at equal correctness | Parallelism is the product. Build [V2](V2.md)'s coordination machinery. |
| **B ≈ C** on correctness and cost | The product is **scoped decomposition**. Parallelism is an optional accelerator. Ship B — a smaller, more reliable system. |
| **C < A or B** on pass rate | Do not ship parallel. Something in the coordination is losing information. |

Either answer is worth knowing *before* building V2. Write the result in
[FINDINGS](FINDINGS.md) whichever way it goes — a null result reported honestly
is the point of having a harness.

---

## Risks carried into this tier

| Risk | Handling |
|---|---|
| Parallelism adds nothing over sequential decomposition | The three-arm experiment. Arm B is the one that could quietly win. |
| Greenfield passes verification and still produces broken software | Smoke flow generated at plan time from the blueprint, never after the fact. |
| Contract drift between workers on a new codebase | `CONTRACT_CHANGE_REQUEST` in MVP.2, not deferred. |
| Environment cold-start dominates wall clock | Measured separately from agent time, starting MVP.1. |
| Blueprint drift mid-build | Known, unsolved at this tier. Recorded, not hidden. |
