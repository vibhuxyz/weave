import test from "node:test";
import assert from "node:assert/strict";
import { ASK_USER_SECTION } from "@weave/core";
import { composeSystemPrompt } from "./prompt-composer.ts";

test("every chat prompt tells the agent to ask instead of stopping", () => {
  const prompt = composeSystemPrompt("build MVP 2", { pendingPreamble: null });
  assert.equal(prompt, `<system>\n${ASK_USER_SECTION}\n</system>\n\nbuild MVP 2`);
});

test("the ask-user section sits after the project rules and before the skills", () => {
  const prompt = composeSystemPrompt("go", {
    pendingPreamble: null,
    ruleCatalog: "RULES",
    skillCatalog: "SKILLS",
  });
  const rulesAt = prompt.indexOf("RULES");
  const askAt = prompt.indexOf(ASK_USER_SECTION);
  const skillsAt = prompt.indexOf("SKILLS");
  assert.ok(rulesAt < askAt && askAt < skillsAt);
});
