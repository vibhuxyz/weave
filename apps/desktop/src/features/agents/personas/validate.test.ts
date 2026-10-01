import test from "node:test";
import assert from "node:assert/strict";
import type { Agent } from "../hooks/useAgents/types";
import { personaIssue, personaRecord } from "./validate";

function builtin(id: string): Agent {
  return {
    id,
    name: id,
    description: "",
    instructions: "",
    builtin: true,
    origin: { kind: "persona" },
    createdAt: 0,
    updatedAt: 0,
  };
}

test("a persona needs a name, description, instructions, an unused id, and a free avatar", () => {
  const taken = new Set(["frontend-engineer"]);
  const free = new Set<string>();
  const character = "gloopies-1";
  const draft = { name: "Reviewer", description: "Looks twice.", instructions: "Review the diff before answering.", character };
  assert.equal(personaIssue({ name: "", description: "", instructions: "Work carefully.", character }, taken, free), "Give the persona a name.");
  assert.equal(personaIssue({ name: "Reviewer", description: "", instructions: "Review the diff.", character }, taken, free), "Say what this persona is for.");
  assert.equal(personaIssue({ name: "Reviewer", description: "Looks twice.", instructions: "", character }, taken, free), "Say how this persona makes the agent work.");
  assert.equal(personaIssue({ name: "Frontend Engineer", description: "UI work.", instructions: "Follow the UI rules.", character }, taken, free), "An employee or persona already uses that name.");
  assert.equal(personaIssue({ ...draft, character: "not-a-character" }, taken, free), "Choose an avatar.");
  assert.equal(personaIssue(draft, taken, new Set(["gloopies-1"])), "Another persona or employee already uses that avatar.");
  assert.equal(personaIssue(draft, taken, free), null);
});

test("a saved persona keeps a known character and drops an unknown one", () => {
  const kept = personaRecord(
    { name: "Reviewer", description: "Looks twice.", instructions: "Review the diff.", character: "fuzzies-1" },
    undefined,
  );
  const dropped = personaRecord(
    { name: "Reviewer", description: "Looks twice.", instructions: "Review the diff.", character: "not-a-character" },
    undefined,
  );
  assert.equal(kept.character, "fuzzies-1");
  assert.equal(kept.origin.kind, "persona");
  assert.equal(kept.overridesBuiltin, undefined);
  assert.equal(dropped.character, undefined);
});

test("customizing a built-in keeps its id and marks the override", () => {
  const saved = personaRecord(
    { name: "Lead Builder", description: "Ships it.", instructions: "Do the task.", character: "fuzzies-1" },
    builtin("builder"),
  );
  assert.equal(saved.id, "builder");
  assert.equal(saved.name, "Lead Builder");
  assert.equal(saved.overridesBuiltin, true);
  assert.equal(saved.builtin, false);
});
