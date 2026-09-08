# Version ladder

**The status board.** One screen: what is shipped, what is next, where each
version lives.

The *reasoning* behind the tiers is in [ROADMAP](ROADMAP.md). The *detail* for
each tier — files, acceptance criteria, edge cases — is in its own file:
[V1](V1.md) · [MVP](MVP.md) · [V2](V2.md) · [V3](V3.md) · [V4](V4.md).
One feature spans its own doc: [CONTINUATION](CONTINUATION.md) — V1.2.

**A new version adds a file to an existing package, not a new top-level
folder.** If something fits none of protocol / agent / core / cli / eval /
desktop, that is a signal to think — not to create `packages/utils`.

---

## Where things stand

| | Version | State | Lands in |
|---|---|---|---|
| ✅ | **V1.0** headless single-agent runner | Shipped `278bf8a` | `packages/{protocol,agent,core,cli}` |
| ✅ | **V1.1** intake · verification ladder · eval harness | Shipped | `core/{intake,verify}.ts`, `eval/`, `protocol/{task,eval,verification}.ts` |
| ⬜ | **V1.2** task state · checkpoints · engine handoff | Not started | `core/{state,checkpoint,handoff,tasks-store}.ts`, `protocol/continuation.ts` |
| ⬜ | **MVP.1** worktrees · pool · scheduler · integrator | Not started | `core/{worktree,pool,scheduler,integrator,compress}.ts` |
| ⬜ | **MVP.2** planner · blueprint · contracts · decide | Not started | `core/{planner,blueprint,contracts,decide}.ts` |
| ⬜ | **MVP.3** lanes in the UI | Not started | `apps/desktop/src/useAcpChat.ts` |
| ⬜ | **V2.1** ownership · event bus · dynamic deps | Not started | `core/{ownership,bus,state,scheduler}.ts` |
| ⬜ | **V2.2** project intelligence | Not started | `core/context/` |
| ⬜ | **V2.3** the full dashboard | Not started | `apps/desktop` |
| ⬜ | **V3.1** routing · budgets · adaptive scale | Not started | `core/{routing,budget,scale,critpath}.ts` |
| ⬜ | **V3.2** supervisor · policy · replay CLI | Not started | `core/{supervisor,policy,replay}.ts` — `checkpoint.ts` pulled forward to [V1.2](CONTINUATION.md) |
| ⬜ | **V3.3** sandboxing · extended ladder | Not started | `core/policy.ts`, `core/verify.ts` |
| ⬜ | **V4** distributed | Not started, gated | — |

---

## ← You are here: V1.1 shipped, standing at the MVP gate

**Shipped** (`f31b854` + since): repeats ≥3 · fresh copy per cell ·
`maxTurns` + `timeoutMs` caps · `noop-trap` category · cost and context capture
· median + min–max matrix · `weave eval` — **plus**, closing V1.1 out:

1. **The verification ladder** — `intake.ts` + `verify.ts`. 8 rungs, detected
   and run, never refuses a repo for having no tests.
2. **Twelve fixtures**, not two — 4 bugfix, 2 feature, 2 refactor,
   2 greenfield, 1 no-test repo, 1 noop-trap, every one verified by a build/
   boot/smoke gate rather than a unit-test suite.
3. **`readOnlyPaths` enforced**, two independent ways (policy + restore).
   `allowedPaths` stays deferred to [MVP.1](MVP.md) on purpose — it needs a
   worktree to mean anything. `Fixture.commit` now checked before the copy.
4. **Engine registry hygiene**, partial — `codex`'s row pointed at a
   deprecated package, fixed; both `codex` and `gemini` confirmed to speak ACP.
   Completing an actual task on either needs an API key this environment
   doesn't have, so that half stays open. See [FINDINGS](FINDINGS.md).
5. **`berd` → `weave`**, orchestrator scope. Desktop app branding (logo,
   locale copy, Tauri bundle id) deliberately untouched — a separate call.
6. **Desktop & engine integration**:
   - `EngineSupervisor` managing live engine switching across 4 ACP engines (`antigravity`,
     `claude-code`, `codex`, `amp`) with warm child pools.
   - In-band engine authentication: `EngineAuthPanel` with interactive terminal auth, API keys,
     OAuth, and live snapshot streaming (`auth-state`). Hardened so auth and login
     prompts fire reliably on every engine, not just the ones that happen to
     surface `authMethods` early (`d758b59`).
   - Multimodal prompts with per-image instruction blocks and `ImageLightbox`.
   - Skills view and plugins integration with prompt system block composition.
   - Dev server and process tree termination (`kill_port` child tree recursion) with AirPlay filtering.
   - Model quota island tracking live rate limits and spend caps.

7. **Safety, plan review, and workspace UI** (`044e656` … `d758b59` + working tree):
   - **Command boundary inspection + `sandbox-exec`** — `confineToTaskDir`
     inspects shell command strings across every engine (rejecting `..` and
     credential-dir references), `--no-sandbox` is now conditional per
     project/task via `resolveEngineArgs`, and on macOS a `sandboxed` task
     additionally wraps the child in `sandbox-exec` with kernel-level deny
     rules. Covered by `packages/agent/src/permissions.test.ts`.
   - **Interactive plan approval** — agent `<plan>` output is normalised to
     `PlanBlockEntry[]` regardless of the shape the engine emits
     (`messageToBlocks.ts`); `PlanApprovalModal` lets the user edit, reorder,
     re-prioritise, add, or drop steps, then the *edited* plan is sent back as
     the next prompt. Reject sends structured feedback instead. Works for all
     engines because it operates on normalised blocks, not an engine API.
   - **File tree in the context panel** — native directory listing over a Tauri
     command (`lib.rs`), rendered by `features/chat/ui/FilesList.tsx`.
   - **Composer / modal layout fixes** (working tree) — transcript scroll area
     is `min-h-0 flex-1`, composer is `shrink-0` so it stays pinned to the
     bottom regardless of transcript length; `PlanApprovalModal` opens as a
     top-anchored near-full-height sheet rather than a small centred box.

**Not yet run:** the actual 12×2×3 baseline matrix. Wiring is done and one real
cell has been verified end to end; the full run is API cost and wall-clock
time, not a wiring question.

Full detail: [V1](V1.md).

**Why this before anything else:** without numbers, every later choice is taste.
The harness is the instrument; build it before the thing it measures.

---

## The two gates

Not every version is a decision point. Two are, and both can send the plan
backwards:

| Gate | Question | If the answer is no |
|---|---|---|
| **End of V1** | Does the matrix report per verification rung, unattended? | MVP's experiment has no baseline. Do not start MVP. |
| **End of MVP** | Does N-worker parallel match 1-worker sequential on pass rate? | **Ship the sequential version.** Scoped decomposition is the product; skip most of V2. |

The second one is the real fork in the road. See the three-arm experiment in
[MVP](MVP.md).

---

## Renumbering, 2026-09-03

The ladder moved from `V0.0 … V0.9` to product tiers. Same work, regrouped so
each tier is independently shippable rather than a slice of the next one.

| Was | Now | |
|---|---|---|
| V0.0 headless runner | **V1.0** | shipped |
| V0.1 eval harness | **V1.1** | + intake, verification ladder |
| V0.2 worktrees, pool, integration | **MVP.1** | |
| V0.3 planner | **MVP.2** | + blueprint, contracts, decide |
| V0.4 dynamic scheduling, ownership | **V2.1** | + event bus |
| V0.5 impact analysis | **V2.2** | folded into `context/` |
| V0.6 replay | **V3.2** | with supervisor + checkpoints |
| V0.7 context | **V2.2** | |
| V0.8 routing | **V3.1** | + budgets, adaptive scale |
| V0.9 the UI | **MVP.3** / **V2.3** | lanes, then the full dashboard |

Code comments referencing the old numbers were updated in the same pass.
