import test from "node:test";
import assert from "node:assert/strict";
import { userTurn } from "./user-turn";

test("a typed message becomes a user turn, so a run request shows where it was typed", () => {
  assert.deepEqual(userTurn("  /parallel build a todo app  ", "t1", 1700), {
    id: "t1",
    role: "user",
    text: "/parallel build a todo app",
    createdAt: 1700,
    thought: "",
    tools: [],
  });
});

test("nothing is added for an empty message", () => {
  assert.equal(userTurn("", "t1", 1700), null);
  assert.equal(userTurn("   \n ", "t1", 1700), null);
});

test("a parallel request keeps the screenshot on the user turn", () => {
  const image = { previewUrl: "blob:cart", mimeType: "image/png", prompt: "cart page" };
  const turn = userTurn("  /parallel fix the coupons  ", "t1", 1700, [image]);
  assert.equal(turn?.text, "/parallel fix the coupons");
  assert.deepEqual(turn?.images, [image]);
});
