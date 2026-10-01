import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildProjectModel } from "../context/index.ts";
import { marketplaceRepo } from "../context/testing.ts";
import { emptyTaskState } from "../state/index.ts";
import { MAX_WORKER_CONTEXT_BYTES } from "./constants.ts";
import { buildWorkerContext } from "./build-context.ts";

const TASK = { id: "T1", goal: "Change the seller payout API to accept a currency", allowedPaths: ["apps/api/**"], readOnlyPaths: ["packages/contracts/**"] };

async function repoWithRule(): Promise<string> {
  const root = await marketplaceRepo();
  await mkdir(join(root, ".weave/rules"), { recursive: true });
  await writeFile(join(root, ".weave/rules/money.md"), "---\nname: money\n---\nNever use number for money.\n");
  return root;
}

test("a fresh worker gets facts, code, rules, only the relevant skills, and its task last", async () => {
  const root = await repoWithRule();
  const { model } = await buildProjectModel({ root });
  const context = await buildWorkerContext({ root, task: TASK, model });
  const { prompt } = context;
  assert.match(prompt, /<project-context[\s\S]*apps\/api\/src\/payouts\/payout.routes.ts/);
  assert.match(prompt, /<code-excerpts>[\s\S]*### apps\/api\/src\/payouts\/payout.service.ts:3 \(SellerPayoutService\)\n```\nexport class SellerPayoutService \{/);
  assert.match(prompt, /<project-rules>[\s\S]*Never use number for money\./);
  assert.deepEqual([...context.skills].sort(), ["builtin:api-conventions", "builtin:backend", "builtin:node", "builtin:typescript"]);
  assert.doesNotMatch(prompt, /## frontend/);
  assert.doesNotMatch(prompt, /<task-state>/);
  assert.ok(prompt.trimEnd().endsWith("</task>"));
  assert.match(prompt, /You may write only: apps\/api\/\*\*/);
  assert.match(prompt, /"taskNotes"/);
  assert.equal(context.contextVersion, 1);
  assert.ok(Buffer.byteLength(prompt, "utf8") <= MAX_WORKER_CONTEXT_BYTES);
  assert.deepEqual(context.sections.map((section) => section.name), ["project", "code", "rules", "skills", "task"]);
});

test("a resumed worker also gets the recorded task state, and the output is deterministic", async () => {
  const root = await repoWithRule();
  const { model } = await buildProjectModel({ root });
  const state = {
    ...emptyTaskState("T1", TASK.goal),
    status: "paused" as const,
    completed: ["Add currency to the contract"],
    nextStep: "Validate currency in createSellerPayout",
    changedFiles: { modified: ["packages/contracts/src/index.ts"], created: [], deleted: [] },
    openQuestions: [{ text: "Which currencies are allowed?", atSeq: 9 }],
  };
  const first = await buildWorkerContext({ root, task: TASK, model, state });
  const second = await buildWorkerContext({ root, task: TASK, model, state });
  assert.match(first.prompt, /<task-state>[\s\S]*OPEN QUESTIONS\n  Which currencies are allowed\?[\s\S]*NEXT STEP\nValidate currency in createSellerPayout[\s\S]*<\/task-state>/);
  assert.deepEqual(first, second);
});

test("a worker sees the milestones Weave tracks for it, and which ones it already reported", async () => {
  const root = await repoWithRule();
  const { model } = await buildProjectModel({ root });
  const subtasks = ["Add currency to the contract", "Validate currency on the route", "Run the checks"];
  const task = { ...TASK, subtasks, verify: "bun run typecheck", verifyRung: "typecheck" };
  const fresh = await buildWorkerContext({ root, task, model });
  assert.match(fresh.prompt, /Milestones Weave tracks for you\. Report each one with a subtask\.completed event the moment it is done/);
  assert.match(fresh.prompt, /1\. Add currency to the contract\n2\. Validate currency on the route\n3\. Run the checks/);
  assert.match(fresh.prompt, /Your work must pass typecheck: run bun run typecheck before you finish\./);
  assert.doesNotMatch(fresh.prompt, /already reported as done/);

  const resumed = await buildWorkerContext({ root, task: { ...task, subtasksDone: [subtasks[0] ?? ""] }, model });
  assert.match(resumed.prompt, /1\. Add currency to the contract — already reported as done\n2\. Validate currency on the route/);
});

test("a worker in a shared folder is told who else works there, instead of 'their own copies'", async () => {
  const root = await repoWithRule();
  const { model } = await buildProjectModel({ root });
  const shared = await buildWorkerContext({ root, task: { ...TASK, sharedWith: [{ id: "T2", allowedPaths: ["server/**", "README.md"] }] }, model });
  assert.match(shared.prompt, /you share this folder with the other workers running at the same time: T2 \(server\/\*\*, README\.md\)\. Their edits appear on disk and in git status while you work; that is expected\. Leave their files alone/);
  assert.doesNotMatch(shared.prompt, /their own copies/);
  const alone = await buildWorkerContext({ root, task: TASK, model });
  assert.match(alone.prompt, /Other workers may be changing their own copies of this repository/);
});
