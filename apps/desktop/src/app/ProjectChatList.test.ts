import test from "node:test";
import assert from "node:assert/strict";
import { baseVisibleCount } from "./ProjectChatList";

test("five chats show by default, fewer when the project has fewer", () => {
  assert.equal(baseVisibleCount(12, -1), 5);
  assert.equal(baseVisibleCount(3, -1), 3);
});

test("an active chat further down stays visible without expanding", () => {
  assert.equal(baseVisibleCount(30, 8), 9);
  assert.equal(baseVisibleCount(30, 2), 5);
});

test("the active-chat stretch never passes the expanded limit of 20", () => {
  assert.equal(baseVisibleCount(200, 150), 20);
});
