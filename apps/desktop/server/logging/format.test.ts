import test from "node:test";
import assert from "node:assert/strict";
import { formatRecord } from "./format.ts";
import { MAX_ARRAY_ITEMS, MAX_FIELD_CHARS } from "./constants.ts";
import type { LogFields } from "./types.ts";

function record(message: string, fields: LogFields) {
  return formatRecord({
    time: "2026-09-21T00:00:00.000Z",
    level: "info",
    component: "setup.consent",
    message,
    fields,
  });
}

test("a record is one line of JSON", () => {
  const line = record("driving the wizard", { key: "down", intent: "navigate" });
  assert.equal(line.includes("\n"), false);
  assert.deepEqual(JSON.parse(line), {
    time: "2026-09-21T00:00:00.000Z",
    level: "info",
    component: "setup.consent",
    message: "driving the wizard",
    intent: "navigate",
    key: "down",
  });
});

test("a long field is cut and says how much was cut", () => {
  const line = JSON.parse(record("page", { head: "x".repeat(MAX_FIELD_CHARS + 50) }));
  assert.equal(typeof line.head, "string");
  assert.ok(line.head.length < MAX_FIELD_CHARS + 50);
  assert.match(line.head, /\(\+50 more chars\)$/);
});

test("a multi-line screen stays on one line", () => {
  const line = record("page", { head: "first\nsecond\r\nthird" });
  assert.equal(JSON.parse(line).head, "first second third");
});

test("a long array is capped and says how many were dropped", () => {
  const items = Array.from({ length: MAX_ARRAY_ITEMS + 3 }, (_, index) => index);
  const parsed = JSON.parse(record("lines", { items }));
  assert.equal(parsed.items.length, MAX_ARRAY_ITEMS + 1);
  assert.equal(parsed.items.at(-1), "(+3 more)");
});

test("fields cannot overwrite the record's own keys", () => {
  const parsed = JSON.parse(record("real", { message: "fake", level: "error" }));
  assert.equal(parsed.message, "real");
  assert.equal(parsed.level, "info");
});

test("field order does not depend on the order they were passed", () => {
  const one = record("page", { focus: "done", checked: true });
  const two = record("page", { checked: true, focus: "done" });
  assert.equal(one, two);
});

test("a cycle is cut rather than thrown on", () => {
  const parent: Record<string, unknown> = { name: "parent" };
  parent.self = parent;
  const parsed = JSON.parse(record("cycle", { parent }));
  assert.equal(parsed.parent.name, "parent");
  assert.equal(parsed.parent.self.self, "object");
});

test("an error is logged as its message, not as an empty object", () => {
  const parsed = JSON.parse(record("failed", { error: new TypeError("bad input") }));
  assert.equal(parsed.error, "TypeError: bad input");
});

test("undefined fields are left out rather than rendered as null", () => {
  const parsed = JSON.parse(record("page", { parsed: undefined, page: "consent" }));
  assert.equal("parsed" in parsed, false);
  assert.equal(parsed.page, "consent");
});
