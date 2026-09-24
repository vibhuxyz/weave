import test from "node:test";
import assert from "node:assert/strict";
import { parseBlueprint, renderBlueprint } from "../blueprint/index.ts";
import { buildContract, lockContract, summarizeContract } from "../contracts/index.ts";
import { decide } from "../decide/index.ts";
import { createPlan } from "./planner.ts";

const BLUEPRINT = {
  stack: "TypeScript, Hono, React",
  components: [
    { name: "api", responsibility: "HTTP API", paths: ["apps/api/**"] },
    { name: "frontend", responsibility: "UI", paths: ["apps/web/**"] },
  ],
  schemas: [{ name: "Note", fields: [{ name: "id", type: "string" }] }],
  endpoints: [{ id: "listNotes", method: "GET", path: "/notes", summary: "list", response: "Note" }],
  events: [],
  smokeFlow: ["GET /notes -> 200"],
};

const PLANNER_ANSWER = JSON.stringify({
  tasks: [
    { id: "API", title: "Build API", prompt: "Serve /notes", allowedPaths: ["apps/api/**"], component: "api", contractSymbols: ["Note"] },
    { id: "WEB", title: "Build UI", prompt: "List notes", allowedPaths: ["apps/web/**"], component: "frontend", contractSymbols: ["Note"] },
  ],
});

test("greenfield: blueprint, contract, plan and decision fit together", async () => {
  const parsed = parseBlueprint(JSON.stringify(BLUEPRINT));
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  const contract = buildContract(parsed.blueprint, 1);

  let seenPrompt = "";
  const outcome = await createPlan({
    request: "a notes app",
    kind: "greenfield",
    rungs: ["diff-review"],
    blueprint: renderBlueprint(parsed.blueprint),
    contract: summarizeContract(contract),
    cwd: "/proj",
    runTurn: async (prompt) => {
      seenPrompt = prompt;
      return PLANNER_ANSWER;
    },
  });

  assert.ok(outcome.ok);
  if (!outcome.ok || outcome.plan.status !== "ready") return;
  assert.match(seenPrompt, /GET \/notes/);
  assert.match(seenPrompt, /exports: Note, ENDPOINTS/);

  const tasks = lockContract(outcome.plan.tasks);
  assert.ok(tasks.every((task) => task.readOnlyPaths?.includes("packages/contracts/**")));
  assert.deepEqual(decide({ kind: "greenfield", tasks, hasContract: true, rungs: [] }), {
    mode: "parallel",
    reason: "components-with-contract",
  });
});
