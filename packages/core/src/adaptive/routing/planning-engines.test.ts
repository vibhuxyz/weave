import test from "node:test";
import assert from "node:assert/strict";
import { choosePlanningEngines } from "./planning-engines.ts";

const engine = (id: string, canPlan: boolean) => ({ id, capabilities: { planning: canPlan } });

test("the engine selected in the chat plans, and another planning engine reviews", () => {
  const candidates = [engine("gemini", false), engine("claude-code", true), engine("codex", true)];
  assert.deepEqual(choosePlanningEngines(candidates), { plannerId: "gemini", reviewerId: "claude-code" });
  assert.deepEqual(choosePlanningEngines([engine("codex", true), engine("claude-code", true)]), { plannerId: "codex", reviewerId: "claude-code" });
});

test("with no other planning engine the selected engine reviews its own plan", () => {
  assert.deepEqual(choosePlanningEngines([engine("gemini", false), engine("opencode", false)]), { plannerId: "gemini", reviewerId: "gemini" });
  assert.deepEqual(choosePlanningEngines([engine("claude-code", true)]), { plannerId: "claude-code", reviewerId: "claude-code" });
  assert.deepEqual(choosePlanningEngines([]), { plannerId: undefined, reviewerId: undefined });
});
