import test from "node:test";
import assert from "node:assert/strict";
import type { PlannedTask } from "../planner/index.ts";
import { decide } from "./decide.ts";
import { mayOverlap } from "./overlap.ts";

function task(id: string, allowedPaths: string[], component?: string): PlannedTask {
  return { id, title: id, prompt: id, cwd: "/proj", allowedPaths, ...(component ? { component } : {}) };
}

const THREE_DISJOINT = [task("T1", ["src/a/**"]), task("T2", ["src/b/**"]), task("T3", ["src/c.ts"])];

test("a single task is always sequential", () => {
  const decision = decide({ kind: "existing", tasks: [task("T1", ["src/**"])], hasContract: false, rungs: ["typecheck"] });
  assert.deepEqual(decision, { mode: "sequential", reason: "single-task" });
});

test("existing repo: three disjoint verifiable tasks run in parallel", () => {
  const decision = decide({ kind: "existing", tasks: THREE_DISJOINT, hasContract: false, rungs: ["diff-review", "build"] });
  assert.deepEqual(decision, { mode: "parallel", reason: "disjoint-paths" });
});

test("existing repo: fewer than three tasks stay sequential", () => {
  const decision = decide({ kind: "existing", tasks: THREE_DISJOINT.slice(0, 2), hasContract: false, rungs: ["build"] });
  assert.equal(decision.reason, "too-few-tasks");
});

test("existing repo: diff-review alone is not a runnable rung", () => {
  const decision = decide({ kind: "existing", tasks: THREE_DISJOINT, hasContract: false, rungs: ["diff-review"] });
  assert.deepEqual(decision, { mode: "sequential", reason: "unverifiable-task" });
});

test("existing repo: a task with its own verify command is verifiable", () => {
  const tasks = THREE_DISJOINT.map((entry) => ({ ...entry, verify: "bun test", verifyRung: "tests" as const }));
  const decision = decide({ kind: "existing", tasks, hasContract: false, rungs: ["diff-review"] });
  assert.equal(decision.mode, "parallel");
});

test("existing repo: overlapping paths stay sequential", () => {
  const tasks = [task("T1", ["src/**"]), task("T2", ["src/b/**"]), task("T3", ["lib/**"])];
  const decision = decide({ kind: "existing", tasks, hasContract: false, rungs: ["build"] });
  assert.deepEqual(decision, { mode: "sequential", reason: "overlapping-paths" });
});

test("greenfield: components plus a contract run in parallel", () => {
  const tasks = [task("T1", ["apps/api/**"], "api"), task("T2", ["apps/web/**"], "frontend")];
  assert.deepEqual(decide({ kind: "greenfield", tasks, hasContract: true, rungs: [] }), {
    mode: "parallel",
    reason: "components-with-contract",
  });
});

test("greenfield: no contract or one component stays sequential", () => {
  const tasks = [task("T1", ["apps/api/**"], "api"), task("T2", ["apps/web/**"], "frontend")];
  assert.equal(decide({ kind: "greenfield", tasks, hasContract: false, rungs: [] }).reason, "no-contract");
  const sameComponent = [task("T1", ["a/**"], "api"), task("T2", ["b/**"], "api")];
  assert.equal(decide({ kind: "greenfield", tasks: sameComponent, hasContract: true, rungs: [] }).reason, "single-component");
});

test("mayOverlap is conservative about globs and exact about literals", () => {
  assert.equal(mayOverlap("src/a.ts", "src/b.ts"), false);
  assert.equal(mayOverlap("src/**", "src/a.ts"), true);
  assert.equal(mayOverlap("**/*.ts", "docs/x.md"), true);
  assert.equal(mayOverlap("apps/api/**", "apps/web/**"), false);
});
