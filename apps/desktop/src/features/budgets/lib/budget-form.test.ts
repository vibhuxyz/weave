import test from "node:test";
import assert from "node:assert/strict";
import { costProblem, engineIdProblem, minutesProblem, toFormValues, toSettings, tokensProblem } from "./budget-form";

test("settings survive the form: dollars stay strings, time shows in minutes", () => {
  const settings = { run: { maxCostUsd: "2.50", maxWallMs: 600_000 }, engine: { codex: { maxTokens: 50_000 } } };
  const values = toFormValues(settings);
  assert.deepEqual(values.scopes.run, { costUsd: "2.50", tokens: "", minutes: "10" });
  assert.deepEqual(values.scopes.project, { costUsd: "", tokens: "", minutes: "" });
  assert.deepEqual(toSettings(values), settings);
});

test("empty rows and engine rows without an id are left out", () => {
  const values = toFormValues({});
  const settings = toSettings({ ...values, engines: [{ engineId: " ", costUsd: "1", tokens: "", minutes: "" }, { engineId: "claude-code", costUsd: "", tokens: "", minutes: "0.5" }] });
  assert.deepEqual(settings, { engine: { "claude-code": { maxWallMs: 30_000 } } });
});

test("field checks accept blanks and refuse what core would reject", () => {
  assert.equal(costProblem(""), null);
  assert.equal(costProblem("3"), null);
  assert.notEqual(costProblem("$3"), null);
  assert.notEqual(costProblem("1.1234567"), null);
  assert.notEqual(tokensProblem("0"), null);
  assert.notEqual(tokensProblem("1.5"), null);
  assert.notEqual(minutesProblem("0"), null);
  assert.equal(minutesProblem("1.5"), null);
  const rows = [{ engineId: "codex", costUsd: "", tokens: "", minutes: "" }, { engineId: " codex ", costUsd: "", tokens: "", minutes: "" }];
  assert.equal(engineIdProblem("codex", rows), "This engine is listed twice");
  assert.equal(engineIdProblem("", []), "Name the engine");
});
