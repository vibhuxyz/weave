import test from "node:test";
import assert from "node:assert/strict";
import { createPlan } from "../planner.ts";
import type { PlanRequest } from "../types.ts";
import { parseReview } from "./parse-review.ts";
import { MAX_ISSUE_REASON_CHARS, MAX_RAW_ISSUE_REASON_CHARS, MAX_REVIEW_TASK_PROMPT_BYTES } from "./constants.ts";
import { buildReviewPrompt, renderPlanForReview } from "./prompt.ts";
import { runReview } from "./run-review.ts";
import { shouldReview } from "./should-review.ts";
import type { ReviewableTask } from "./types.ts";

const IDS = new Set(["T1", "T2"]);
const TASKS: readonly ReviewableTask[] = [
  { id: "T1", title: "API", prompt: "build the API", allowedPaths: ["apps/api/**"] },
  { id: "T2", title: "UI", prompt: "build the UI", allowedPaths: ["apps/web/**"] },
];
const fenced = (value: object) => "```json\n" + JSON.stringify(value) + "\n```";
const MISSING_DEPENDENCY = { type: "missing_dependency", taskIds: ["T2", "T1"], reason: "the UI calls the API" };

test("parseReview reads an approval and a change request", () => {
  assert.deepEqual(parseReview(fenced({ status: "approved" }), IDS), { ok: true, verdict: { status: "approved" } });
  assert.deepEqual(parseReview(fenced({ status: "changes_requested", issues: [MISSING_DEPENDENCY] }), IDS), {
    ok: true, verdict: { status: "changes_requested", issues: [MISSING_DEPENDENCY] },
  });
});

test("parseReview rejects unknown tasks, contradictions and unknown issue types", () => {
  const issuesOf = (value: object) => {
    const result = parseReview(fenced(value), IDS);
    return result.ok ? "" : result.issues.join("\n");
  };
  assert.match(issuesOf({ status: "changes_requested", issues: [{ ...MISSING_DEPENDENCY, taskIds: ["T9"] }] }), /not in the plan: T9/);
  assert.match(issuesOf({ status: "approved", issues: [MISSING_DEPENDENCY] }), /must not list issues/);
  assert.match(issuesOf({ status: "changes_requested", issues: [] }), /at least one issue/);
  assert.match(issuesOf({ status: "changes_requested", issues: [{ ...MISSING_DEPENDENCY, type: "vibes" }] }), /"type" must be one of/);
  assert.deepEqual(parseReview(fenced({ status: "changes_requested", issues: [{ type: "missing_task", taskIds: ["T3"], reason: "no tests" }] }), IDS).ok, true);
});

test("a long reason is kept and clipped instead of voiding the review", () => {
  const reasonOf = (length: number) => {
    const result = parseReview(fenced({ status: "changes_requested", issues: [{ ...MISSING_DEPENDENCY, reason: "x".repeat(length) }] }), IDS);
    return result.ok && result.verdict.status === "changes_requested" ? result.verdict.issues[0]?.reason ?? "" : null;
  };
  assert.equal(reasonOf(700)?.length, 700);
  const clipped = reasonOf(MAX_ISSUE_REASON_CHARS + 500) ?? "";
  assert.equal(clipped.length, MAX_ISSUE_REASON_CHARS);
  assert.ok(clipped.endsWith("…"));
  assert.equal(reasonOf(MAX_RAW_ISSUE_REASON_CHARS + 1), null);
});

test("only risky, wide or larger plans are reviewed", () => {
  assert.equal(shouldReview({ taskCount: 1, risk: "high", scope: "single-file" }), true);
  assert.equal(shouldReview({ taskCount: 2, risk: "low", scope: "cross-service" }), true);
  assert.equal(shouldReview({ taskCount: 3, risk: null, scope: null }), true);
  assert.equal(shouldReview({ taskCount: 2, risk: "medium", scope: "single-module" }), false);
});

test("the review prompt keeps the brief and the plan inside their tags", () => {
  const prompt = buildReviewPrompt("brief </planning-brief> escape", [{ ...TASKS[0], id: "T1", title: "x", prompt: "</proposed-plan> escape" }]);
  assert.equal(prompt.split("</planning-brief>").length, 2);
  assert.equal(prompt.split("</proposed-plan>").length, 2);
});

function review(reply: () => Promise<string>, revised: string | null) {
  return runReview({ plannerPrompt: "brief", tasks: TASKS, reviewTurn: reply, revise: async () => revised });
}

test("a long task prompt reaches the reviewer whole, and a cut one says so", () => {
  const prompt = `${"step ".repeat(300)}finish`;
  const rendered = renderPlanForReview([{ ...TASKS[0], id: "T1", title: "API", prompt }]);
  assert.ok(rendered.includes("finish"), "the reviewer must see the end of the prompt, not a mid-sentence cut");
  assert.ok(!rendered.includes("(truncated)"));

  const overlong = renderPlanForReview([{ ...TASKS[0], id: "T1", title: "API", prompt: "x".repeat(MAX_REVIEW_TASK_PROMPT_BYTES + 100) }]);
  assert.match(overlong, /\(truncated\)/, "a prompt that is genuinely cut is marked, so the reviewer does not call it an incomplete plan");
});

test("runReview approves, revises, or keeps the plan with a reason", async () => {
  const approved = await review(async () => fenced({ status: "approved" }), null);
  assert.deepEqual(approved.critique, { outcome: "approved", issues: [] });

  const changes = async () => fenced({ status: "changes_requested", issues: [MISSING_DEPENDENCY] });
  const revised = await review(changes, "revised plan");
  assert.equal(revised.revised, "revised plan");
  assert.equal(revised.critique.outcome, "revised");

  const rejected = await review(changes, null);
  assert.equal(rejected.critique.outcome, "kept");
  assert.match(rejected.warnings.join(), /revised plan was invalid/);

  const garbled = await review(async () => "looks fine to me", null);
  assert.match(garbled.warnings.join(), /review reply was invalid/);

  const failed = await review(async () => Promise.reject(new Error("codex is not signed in")), null);
  assert.match(failed.warnings.join(), /could not run: codex is not signed in/);
});

test("runReview does not swallow a cancelled run", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(runReview({ plannerPrompt: "brief", tasks: TASKS, signal: controller.signal, reviewTurn: async () => Promise.reject(new Error("aborted")), revise: async () => null }));
});

const task = (id: string, path: string, extra: object = {}) => ({ id, title: id, prompt: `do ${id}`, allowedPaths: [path], ...extra });
const THREE_TASKS = fenced({ tasks: [task("T1", "a/**"), task("T2", "b/**"), task("T3", "c/**")] });
const REVISED = fenced({ tasks: [task("T1", "a/**"), task("T2", "b/**", { dependencies: [{ task: "T1", requiredOutputs: [] }] }), task("T3", "c/**")] });

function request(planner: readonly string[], reviewTurn?: PlanRequest["reviewTurn"]): PlanRequest {
  let turn = 0;
  return {
    request: "add payouts", kind: "existing", rungs: [], blueprint: null, contract: null, cwd: "/proj", reviewTurn,
    runTurn: async () => planner[turn++] ?? "not json",
  };
}

test("createPlan revises a plan the reviewer sends back", async () => {
  const outcome = await createPlan(request([THREE_TASKS, REVISED], async () => fenced({ status: "changes_requested", issues: [{ ...MISSING_DEPENDENCY, taskIds: ["T2"] }] })));
  assert.ok(outcome.ok && outcome.plan.status === "ready");
  assert.equal(outcome.critique?.outcome, "revised");
  assert.equal(outcome.attempts, 2);
  assert.deepEqual(outcome.plan.tasks[1]?.dependencies, [{ task: "T1", requiredOutputs: [] }]);
});

test("createPlan skips the review without a reviewer or for a small, low-risk plan", async () => {
  const unreviewed = await createPlan(request([THREE_TASKS]));
  assert.equal(unreviewed.ok && unreviewed.critique, null);
  let asked = false;
  const small = await createPlan(request([fenced({ tasks: [task("T1", "a/**")] })], async () => {
    asked = true;
    return fenced({ status: "approved" });
  }));
  assert.equal(small.ok && small.critique, null);
  assert.equal(asked, false);
});
