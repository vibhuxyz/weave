import test from "node:test";
import assert from "node:assert/strict";
import { isProviderLimit } from "../relay/index.ts";

test("hitting a session limit reads as a provider limit, so the work moves engine", () => {
  assert.equal(isProviderLimit("You've hit your session limit · resets 1:50am (Asia/Calcutta)"), true);
  assert.equal(isProviderLimit("Internal error: You've hit your session limit"), true);
  assert.equal(isProviderLimit("rate limit exceeded"), true);
  assert.equal(isProviderLimit("TypeError: undefined is not a function"), false);
  assert.equal(isProviderLimit(null), false);
});
