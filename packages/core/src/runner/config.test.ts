import test from "node:test";
import assert from "node:assert/strict";
import { agentConfigFrom } from "@weave/protocol";

test("the options the user picked in their session are what a run asks every engine for", () => {
  assert.deepEqual(agentConfigFrom({ engine: "claude-code", configOptions: { model: "claude-haiku-4-5", effort: "medium" } }), {
    model: "claude-haiku-4-5",
    effort: "medium",
  });
  assert.deepEqual(agentConfigFrom({ engine: "claude-code" }), {});
});

test("an explicit model on the run wins over the session's option of the same name", () => {
  assert.deepEqual(agentConfigFrom({ configOptions: { model: "claude-haiku-4-5", thinking: "on" }, model: "opus-5" }), {
    model: "opus-5",
    thinking: "on",
  });
});
