import test from "node:test";
import assert from "node:assert/strict";
import { ASK_USER_SECTION, buildBasePrompt } from "./base.prompt.ts";
import { BUILTIN_AGENTS, formatAgentProfile } from "./index.ts";

test("both write and read-only agents are told to ask the user", () => {
  assert.ok(buildBasePrompt("write").includes(ASK_USER_SECTION));
  assert.ok(buildBasePrompt("read-only").includes(ASK_USER_SECTION));
});

test("every built-in agent profile carries the ask-user section once", () => {
  for (const agent of BUILTIN_AGENTS) {
    const prompt = formatAgentProfile(agent);
    assert.equal(prompt.split(ASK_USER_SECTION).length, 2, agent.id);
  }
});
