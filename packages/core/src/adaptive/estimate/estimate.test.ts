import test from "node:test";
import assert from "node:assert/strict";
import { buildStats } from "../history/index.ts";
import { COMPLEXITY_PRIOR_MS, DEFAULT_MS_PER_UNIT } from "./constants.ts";
import { estimateAttempt } from "./estimate-attempt.ts";

const NO_HISTORY = buildStats([]);

test("without history the planner's complexity sets the expected duration", () => {
  const query = { engineId: "claude-code", kind: "api", sizeUnits: 2 };
  assert.equal(estimateAttempt(NO_HISTORY, { ...query, complexity: "high" }).ms, COMPLEXITY_PRIOR_MS.high);
  assert.equal(estimateAttempt(NO_HISTORY, { ...query, complexity: "low" }).ms, COMPLEXITY_PRIOR_MS.low);
  assert.equal(estimateAttempt(NO_HISTORY, query).ms, DEFAULT_MS_PER_UNIT * 2);
});
