import test from "node:test";
import assert from "node:assert/strict";
import { createPlan } from "../planner.ts";
import type { PlanRequest } from "../types.ts";
import { validatePlan } from "./validate-plan.ts";
import type { PlanValidationContext, ReviewedTask } from "./types.ts";

const OPEN: PlanValidationContext = { supportedRungs: null, employeeIds: null, skillNames: null, engineIds: null };

function task(id: string, allowedPaths: string[], extra: Partial<ReviewedTask> = {}): ReviewedTask {
  return { id, allowedPaths, subtasks: [`plan ${id}`, `finish ${id}`], ...extra };
}

function after(...ids: string[]): Pick<ReviewedTask, "dependencies"> {
  return { dependencies: ids.map((id) => ({ task: id, requiredOutputs: [] })) };
}

test("tasks that can run together must not write overlapping paths", () => {
  const { errors } = validatePlan([task("T1", ["apps/api/**"]), task("T2", ["apps/api/src/payouts/**"]), task("T3", ["apps/web/**"])], OPEN);
  assert.equal(errors.length, 1);
  assert.match(errors[0] ?? "", /T1 and T2 can run at the same time but both write apps\/api\/\*\* and apps\/api\/src\/payouts\/\*\*/);
});

test("overlapping writes are fine when one task waits for the other, even through a chain", () => {
  const tasks = [task("T1", ["apps/api/**"]), task("T2", ["apps/web/**"], after("T1")), task("T3", ["apps/api/**"], after("T2"))];
  assert.deepEqual(validatePlan(tasks, OPEN).errors, []);
});

test("an employee off the roster and a rung the project cannot run are errors", () => {
  const context: PlanValidationContext = { supportedRungs: ["diff-review", "typecheck"], employeeIds: ["backend-engineer"], skillNames: null, engineIds: ["claude-code"] };
  const { errors } = validatePlan([task("T1", ["a/**"], { employee: "payments-specialist", verifyRung: "build" })], context);
  assert.match(errors.join("\n"), /"payments-specialist", which is not on the roster \(backend-engineer\)/);
  assert.match(errors.join("\n"), /verifies with "build", which this project cannot run \(supported: diff-review, typecheck\)/);
});

test("unknown skills and a plan without verification are warnings, not errors", () => {
  const context: PlanValidationContext = { supportedRungs: ["diff-review", "tests"], employeeIds: null, skillNames: ["Postgres"], engineIds: null };
  const review = validatePlan([task("T1", ["a/**"], { skills: ["postgres", "payments-magic"] })], context);
  assert.deepEqual(review.errors, []);
  assert.deepEqual(review.warnings, [
    "Task T1 asks for skills not in the catalog: payments-magic",
    "No task names a verification step, although the project supports: tests",
  ]);
});

test("a required output must be declared by its producer, so a dependent can start before the producer ends", () => {
  const consumer = task("T2", ["apps/web/**"], { dependencies: [{ task: "T1", requiredOutputs: ["Todo", "API_ROUTES"] }] });
  const silent = validatePlan([task("T1", ["packages/shared/**"]), consumer], OPEN);
  assert.match(silent.errors.join("\n"), /T2 waits for Todo, API_ROUTES from T1, but T1 does not list them in "produces"/);

  const partial = validatePlan([task("T1", ["packages/shared/**"], { produces: ["Todo"] }), consumer], OPEN);
  assert.match(partial.errors.join("\n"), /T2 waits for API_ROUTES from T1/);

  const declared = validatePlan([task("T1", ["packages/shared/**"], { produces: ["Todo", "API_ROUTES"] }), consumer], OPEN);
  assert.deepEqual(declared.errors, []);
  assert.deepEqual(declared.warnings, []);
});

test("a worker with no milestones is a warning, because nothing reports progress until it finishes", () => {
  const review = validatePlan([task("T1", ["a/**"], { subtasks: [] }), task("T2", ["b/**"])], OPEN);
  assert.deepEqual(review.errors, []);
  assert.deepEqual(review.warnings, ["No milestones to report progress against in: T1; those workers only report when they finish"]);
});

test("a task with dependents but no declared outputs is a warning, because nothing can start before it ends", () => {
  const review = validatePlan([task("T1", ["a/**"]), task("T2", ["b/**"], after("T1"))], OPEN);
  assert.deepEqual(review.errors, []);
  assert.match(review.warnings.join("\n"), /T1 has dependents but lists no "produces"/);
});

function answer(tasks: readonly object[]): string {
  return "```json\n" + JSON.stringify({ tasks }) + "\n```";
}

const CLASHING = answer([
  { id: "T1", title: "API", prompt: "api", allowedPaths: ["apps/api/**"] },
  { id: "T2", title: "Also API", prompt: "more api", allowedPaths: ["apps/api/**"] },
]);
const FIXED = answer([
  { id: "T1", title: "API", prompt: "api", allowedPaths: ["apps/api/**"], produces: ["OrdersApi"], subtasks: ["publish the contract", "implement it"] },
  { id: "T2", title: "Also API", prompt: "more api", allowedPaths: ["apps/api/**"], dependencies: [{ task: "T1", requiredOutputs: ["OrdersApi"] }], subtasks: ["read the contract", "use it"] },
]);

function request(answers: readonly string[], prompts: string[]): PlanRequest {
  return {
    request: "add payouts", kind: "existing", rungs: [], blueprint: null, contract: null, cwd: "/proj",
    runTurn: async (prompt) => {
      prompts.push(prompt);
      return answers[prompts.length - 1] ?? "not json";
    },
  };
}

test("createPlan sends validation errors back for one repair", async () => {
  const prompts: string[] = [];
  const outcome = await createPlan(request([CLASHING, FIXED], prompts));
  assert.equal(outcome.ok && outcome.attempts, 2);
  assert.deepEqual(outcome.ok && outcome.warnings, []);
  assert.match(prompts[1] ?? "", /T1 and T2 can run at the same time/);
});

test("createPlan keeps a plan whose errors survive the repair, and reports them as warnings", async () => {
  const stillClashing = await createPlan(request([CLASHING, CLASHING], []));
  assert.equal(stillClashing.ok, true);
  assert.match(stillClashing.ok ? stillClashing.warnings.join("\n") : "", /can run at the same time/);

  const brokenRepair = await createPlan(request([CLASHING, "not json"], []));
  assert.equal(brokenRepair.ok, true);
  assert.match(brokenRepair.ok ? brokenRepair.warnings.join("\n") : "", /first plan was kept/);
});
