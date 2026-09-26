import test from "node:test";
import assert from "node:assert/strict";
import { withChosenEngine } from "./chosen-engine.ts";
import type { EngineCandidate } from "./types.ts";

const ABLE = { fileEditing: true, toolCalls: true } as const;
const CANDIDATES: readonly EngineCandidate[] = [
  { id: "claude-code", capabilities: ABLE },
  { id: "codex", capabilities: ABLE },
  { id: "reader", capabilities: { toolCalls: true } },
];
const CHAIN = ["claude-code", "codex"] as const;

function task(engine?: string, capabilities?: readonly string[]) {
  return { id: "T1", prompt: "build the api", ...(engine === undefined ? {} : { engine }), ...(capabilities ? { capabilities } : {}) };
}

test("a chosen engine goes first and the rest stay as fallbacks", () => {
  const decided = withChosenEngine({ task: task("codex"), chain: CHAIN, candidates: CANDIDATES });
  assert.deepEqual(decided.chain, ["codex", "claude-code"]);
  assert.equal(decided.refusal, null);
});

test("no choice leaves the routed chain untouched", () => {
  const decided = withChosenEngine({ task: task(), chain: CHAIN, candidates: CANDIDATES });
  assert.deepEqual(decided.chain, CHAIN);
  assert.equal(decided.refusal, null);
});

test("an engine that is not installed is refused, with the chain kept", () => {
  const decided = withChosenEngine({ task: task("gemini"), chain: CHAIN, candidates: CANDIDATES });
  assert.deepEqual(decided.chain, CHAIN);
  assert.match(decided.refusal ?? "", /engine gemini is not installed for this run; claude-code runs it instead/);
});

test("an engine missing a capability the task needs is refused", () => {
  const decided = withChosenEngine({ task: task("reader"), chain: CHAIN, candidates: CANDIDATES });
  assert.deepEqual(decided.chain, CHAIN);
  assert.match(decided.refusal ?? "", /engine reader does not declare fileEditing/);

  const needsMore = withChosenEngine({ task: task("codex", ["imageInput"]), chain: CHAIN, candidates: CANDIDATES });
  assert.match(needsMore.refusal ?? "", /engine codex does not declare imageInput/);
});
