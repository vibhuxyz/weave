import test from "node:test";
import assert from "node:assert/strict";
import { personaIssue } from "./validate";

test("a persona needs a name, instructions, and an unused id", () => {
  const taken = new Set(["frontend-engineer"]);
  assert.equal(personaIssue({ name: "", description: "", instructions: "Work carefully." }, taken), "Give the persona a name.");
  assert.equal(personaIssue({ name: "Reviewer", description: "", instructions: "" }, taken), "Say how this persona makes the agent work.");
  assert.equal(personaIssue({ name: "Frontend Engineer", description: "", instructions: "Follow the UI rules." }, taken), "An employee or persona already uses that name.");
  assert.equal(personaIssue({ name: "Reviewer", description: "Looks twice.", instructions: "Review the diff before answering." }, taken), null);
});
