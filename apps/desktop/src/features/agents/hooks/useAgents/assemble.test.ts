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

test("a saved persona replaces the built-in with the same id", () => {
  const builtin = agent("builder", "persona");
  const saved = { ...agent("builder", "persona"), name: "Lead Builder" };
  const custom = agent("reviewer", "persona");
  const employee = agent("frontend-engineer", "employee");
  const agents = assembleAgents([employee], [saved, custom], [builtin]);
  assert.deepEqual(agents.map((item) => item.id), ["frontend-engineer", "builder", "reviewer"]);
  assert.equal(agents[1], saved);
});

test("an employee with the same id hides the built-in persona", () => {
  const builtin = agent("builder", "persona");
  const saved = agent("builder", "persona");
  const employee = agent("builder", "employee");
  const agents = assembleAgents([employee], [saved], [builtin]);
  assert.deepEqual(agents.map((item) => item.id), ["builder"]);
  assert.equal(agents[0], employee);
});
