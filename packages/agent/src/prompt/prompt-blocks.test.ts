import test from "node:test";
import assert from "node:assert/strict";
import { blocksForSessionPrompt, promptBlocks } from "./prompt-blocks.ts";

const cart = { data: "Y2FydA==", mimeType: "image/png", prompt: "cart\npage" };

test("an attached image follows its label, on one line", () => {
  assert.deepEqual(promptBlocks("fix the coupons", [cart]), [
    { type: "text", text: "fix the coupons" },
    { type: "text", text: "Image 1: cart page" },
    { type: "image", data: "Y2FydA==", mimeType: "image/png" },
  ]);
  assert.deepEqual(promptBlocks("look", [{ data: "YQ==", mimeType: "image/jpeg" }]), [
    { type: "text", text: "look" },
    { type: "text", text: "Image 1:" },
    { type: "image", data: "YQ==", mimeType: "image/jpeg" },
  ]);
});

test("a session sends its images once, then again after the session is replaced", () => {
  const first = blocksForSessionPrompt("plan this", [cart], false);
  assert.equal(first.imagesSent, true);
  assert.equal(first.blocks.some((block) => block.type === "image"), true);
  const later = blocksForSessionPrompt("repair the plan", [cart], first.imagesSent);
  assert.deepEqual(later.blocks, [{ type: "text", text: "repair the plan" }]);
  const replaced = blocksForSessionPrompt("plan this", [cart], false);
  assert.equal(replaced.blocks.some((block) => block.type === "image"), true);
});
