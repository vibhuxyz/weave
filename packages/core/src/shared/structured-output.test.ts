import test from "node:test";
import assert from "node:assert/strict";
import { parseJsonBlock } from "./structured-output.ts";

test("parseJsonBlock parses standard fenced JSON", () => {
  const result = parseJsonBlock('```json\n{"tasks": [{"id": "T1"}]}\n```');
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value, { tasks: [{ id: "T1" }] });
  }
});

test("parseJsonBlock handles whitespace-only or empty output", () => {
  const empty = parseJsonBlock("");
  assert.equal(empty.ok, false);
  if (!empty.ok) {
    assert.equal(empty.issue, "No output received from the engine");
  }

  const spaces = parseJsonBlock("   \n\t  ");
  assert.equal(spaces.ok, false);
  if (!spaces.ok) {
    assert.equal(spaces.issue, "No output received from the engine");
  }
});

test("parseJsonBlock parses fences with variations (uppercase, no language tag, no trailing newline)", () => {
  const uppercase = parseJsonBlock('```JSON\n{"key": "value"}\n```');
  assert.equal(uppercase.ok, true);

  const noTag = parseJsonBlock('```\n{"key": "value"}\n```');
  assert.equal(noTag.ok, true);

  const noNewline = parseJsonBlock('```json\n{"key": "value"}```');
  assert.equal(noNewline.ok, true);
});

test("parseJsonBlock extracts raw JSON without code fences", () => {
  const raw = parseJsonBlock('{"key": "value"}');
  assert.equal(raw.ok, true);
  if (raw.ok) {
    assert.deepEqual(raw.value, { key: "value" });
  }
});

test("parseJsonBlock extracts JSON object embedded with preamble text", () => {
  const preamble = parseJsonBlock('Here is the plan for the full stack app:\n\n{"tasks": [{"id": "T1"}]}\n\nHope this helps!');
  assert.equal(preamble.ok, true);
  if (preamble.ok) {
    assert.deepEqual(preamble.value, { tasks: [{ id: "T1" }] });
  }
});

test("parseJsonBlock reports invalid JSON gracefully", () => {
  const invalid = parseJsonBlock('```json\n{ invalid: json }\n```');
  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.match(invalid.issue, /Output is not valid JSON/);
  }
});
