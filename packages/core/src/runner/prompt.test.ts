import test from "node:test";
import assert from "node:assert/strict";
import type { PromptBlock } from "@weave/agent";
import { promptWithDeadline } from "./prompt.ts";
import type { RunTaskTracker } from "./sink.ts";

test("a worker prompt carries the run's images, and a text prompt stays text", async () => {
  const seen: PromptBlock[][] = [];
  const session = {
    prompt: async (blocks: PromptBlock[]) => {
      seen.push(blocks);
      return { stopReason: "end_turn" };
    },
    cancel: async () => undefined,
  };
  const tracker: RunTaskTracker = { turns: 0, stopped: null, finalMessage: [] };
  await promptWithDeadline(session, "fix the coupons", 1_000, tracker, [{ data: "Y2FydA==", mimeType: "image/png", prompt: "cart page" }]);
  await promptWithDeadline(session, "fix the coupons", 1_000, tracker);
  assert.deepEqual(seen[0], [
    { type: "text", text: "fix the coupons" },
    { type: "text", text: "Image 1: cart page" },
    { type: "image", data: "Y2FydA==", mimeType: "image/png" },
  ]);
  assert.deepEqual(seen[1], [{ type: "text", text: "fix the coupons" }]);
});
