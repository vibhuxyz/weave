import test from "node:test";
import assert from "node:assert/strict";
import type { SessionConfigOption } from "@agentclientprotocol/sdk";
import { planExitTarget, splitConfigOptions } from "./sessionConfig";

function select(
  id: string,
  values: readonly string[],
  category?: string,
): SessionConfigOption {
  return {
    id,
    name: id,
    category,
    type: "select",
    currentValue: values[0],
    options: values.map((value) => ({ value, name: value })),
  } as SessionConfigOption;
}

const MODE = select("mode", ["default", "accept-edits", "plan"], "mode");
const MODEL = select("model", ["gemini-3.8-flash"], "model");
const EFFORT = select("reasoningEffort", ["low", "high"], "effort");

test("an agent with native modes does not also get a mode pill", () => {
  const split = splitConfigOptions([MODEL, MODE, EFFORT], { hasNativeModes: true });
  assert.equal(split.model, MODEL);
  assert.equal(split.primary, EFFORT);
  assert.equal(split.children.includes(MODE), false);
});

test("an agent without native modes keeps its mode pill", () => {
  const split = splitConfigOptions([MODEL, MODE, EFFORT], { hasNativeModes: false });
  assert.equal(split.primary, MODE);
  assert.deepEqual(split.children, [EFFORT]);
});

test("the mode option is dropped by category even when its id differs", () => {
  const named = select("agy.execution", ["default", "plan"], "mode");
  const split = splitConfigOptions([named], { hasNativeModes: true });
  assert.equal(split.primary, undefined);
  assert.deepEqual(split.children, []);
});

test("dropping the mode leaves nothing to show when it was the only knob", () => {
  const split = splitConfigOptions([MODE], { hasNativeModes: true });
  assert.equal(split.primary, undefined);
});

test("splitting without the option argument behaves as it did before", () => {
  assert.equal(splitConfigOptions([MODEL, MODE]).primary, MODE);
});

test("leaving plan mode prefers accept-edits however the agent spells it", () => {
  assert.equal(planExitTarget(["plan", "acceptEdits", "default"]), "acceptEdits");
  assert.equal(planExitTarget(["default", "accept-edits", "plan"]), "accept-edits");
});

test("leaving plan mode falls back to default, then to anything but plan", () => {
  assert.equal(planExitTarget(["plan", "default"]), "default");
  assert.equal(planExitTarget(["plan", "yolo"]), "yolo");
});

test("an agent offering only plan has nowhere to exit to", () => {
  assert.equal(planExitTarget(["plan"]), null);
  assert.equal(planExitTarget([]), null);
});

test("approving into review mode prefers default over accept-edits", () => {
  assert.equal(planExitTarget(["plan", "accept-edits", "default"], "default"), "default");
  assert.equal(planExitTarget(["plan", "acceptEdits", "default"], "accept-edits"), "acceptEdits");
});

test("an intent the agent cannot offer still leaves plan mode", () => {
  assert.equal(planExitTarget(["plan", "yolo"], "default"), "yolo");
});
