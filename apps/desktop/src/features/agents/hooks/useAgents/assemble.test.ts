import test from "node:test";
import assert from "node:assert/strict";
import { assembleAgents } from "./assemble";
import type { Agent } from "./types";

function agent(id: string, kind: Agent["origin"]["kind"]): Agent {
  return {
    id,
    name: id,
    description: "",
    instructions: "",
    origin: kind === "persona" ? { kind } : { kind, source: "project" },
    createdAt: 0,
    updatedAt: 0,
  };
}

test("built-in personas sit after employees and a saved persona does not replace them", () => {
  const builtin = agent("builder", "persona");
  const saved = agent("builder", "persona");
  const custom = agent("reviewer", "persona");
  const employee = agent("frontend-engineer", "employee");
  const agents = assembleAgents([employee], [saved, custom], [builtin]);
  assert.deepEqual(agents.map((item) => item.id), ["frontend-engineer", "builder", "reviewer"]);
  assert.equal(agents[1], builtin);
});
