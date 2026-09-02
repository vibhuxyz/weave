# Version ladder

Where each version lives, and what has to be true before it counts as done.

**A new version adds a file to an existing package, not a new top-level
folder.** If something fits none of protocol / agent / core / cli / eval /
desktop, that is a signal to think — not to create `packages/utils`.

---

## ✅ V0.0 — headless single-agent runner

**Shipped.** `278bf8a`

Agent spawn, prompt, and event stream live in `packages/{agent,core}`, driven
by a CLI, writing every raw ACP message to
`.berd/runs/<runId>/events.ndjson`.

**Acceptance:** `berd run --dir ./repo --prompt "..."` fixes a bug on disk with
no window open, and the event log replays the whole turn. ✅

```
run 20260902-181935-3rek
  session bd6e3f6c (new)
  · Read math.js
  · Edit math.js
  allow  Edit math.js — allow_always; within task cwd
  ok in 13700ms

{ "status": "ok", "filesWritten": [], "filesChanged": ["math.js"] }
```

The ledger was earned here instead of at V0.6, for the cost of one
`appendFileSync`.

**Also landed early:** the permission policy (`packages/agent/permissions.ts`).
It was on the V0.2 list, but auto-approve could not survive the move to
headless runs — there is no human at a window to catch anything.

---

## V0.1 — the eval harness

`packages/eval/`. Scaffolded, not yet driven.

Run N tasks × M configs unattended, collect metrics, print a matrix.

**Acceptance:** `pnpm eval` runs 10 fixed tasks across ≥2 configs without a
window, and prints pass rate, wall clock, and files changed per cell.

**To do:**
- Fill `fixtures/tasks.json` with 10 tasks that have real `verify` commands.
- Pin fixture repos (commits or submodules) so results are comparable.
- Wire `score.ts` into `harness.ts` — currently `verify()` exists but nothing
  calls it.
- A `berd eval` subcommand.

**Why this is next:** without numbers, every later choice is taste. The harness
is the instrument; build it before the thing it measures.

---

## V0.2 — worktrees, pool, sequential integration

`packages/core/{worktree,pool,scheduler,integrator}.ts`

N agents, each with `cwd` pointing at a different git worktree, each tagged
with a task id. The sandbox story survives unchanged: "agent confined to
project folder" becomes "agent confined to its worktree" for free.

**Acceptance:** 3 tasks with no overlapping files run concurrently in separate
worktrees and merge cleanly, with the ledger showing which task touched what.

**Notes:**
- Worktrees go under `.berd/worktrees/<taskId>/`.
- `allowedPaths` on `TaskContract` starts being enforced here.
- Integration is sequential and verified — merge one, run `verify`, then next.

---

## V0.3 — planner

`packages/core/planner.ts` — prompt → DAG of `TaskContract`s.

**Acceptance:** one prompt produces a task graph that the V0.2 scheduler runs
without hand-editing.

---

## V0.4 — dynamic scheduling, ownership

`scheduler.ts` grows dynamic; `ownership.ts` adds path claims and blocking, so
two tasks cannot both hold the same file.

---

## V0.5 — impact analysis

`impact.ts` — a `ts-morph` graph to find files affected by a change, so tasks
are scoped from the code rather than from a guess.

---

## V0.6 — replay

`replay.ts`. Mostly a reader over the ledger, which already exists, so this is
smaller than it sounds.

---

## V0.7 — context

`context/` — model, docs, graph, retrieval.

---

## V0.8 — routing

`routing.ts` — pick an engine/model per task from measured statistics, not
taste. Depends on V0.1's numbers.

---

## V0.9 — the UI

`apps/desktop` is arguably already here. Parked deliberately after the
workspace split; come back once V0.2 gives it something worth showing.
