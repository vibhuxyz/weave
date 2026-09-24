import test from "node:test";
import assert from "node:assert/strict";
import { parseEmployee } from "@weave/core";
import { copyFormValues, emptyFormValues, idFromName, linesOf, toEmployeeFields, toFormValues } from "./employee-form";

const ORIGIN = { source: "project", sourcePath: null } as const;

function parse(raw: unknown) {
  const parsed = parseEmployee(raw, ORIGIN);
  assert.ok(parsed.ok, parsed.ok ? "" : parsed.issues.join("; "));
  return parsed.employee;
}

const SAMPLE = parse({
  id: "payments-lead",
  name: "Payments Lead",
  description: "Owns payouts.",
  responsibilities: ["payouts", "ledger"],
  skills: ["typescript"],
  rules: ["Money is integer paise."],
  instructions: "Be careful.",
  permissions: { filesystem: { write: ["apps/api/**"] }, network: { allowed: false } },
  engines: { preferred: ["codex"], allowed: ["codex", "claude-code"] },
  verification: { required: ["typecheck"], preferred: ["tests"] },
  memory: { enabled: true, maxEntries: 50, recallCount: 4 },
});

test("an employee survives form values and back through the real parser", () => {
  assert.deepEqual(parse(toEmployeeFields(toFormValues(SAMPLE))), SAMPLE);
});

test("empty form values parse once named", () => {
  const employee = parse(toEmployeeFields({ ...emptyFormValues(), id: "helper", name: "Helper" }));
  assert.equal(employee.engines.allowed, null);
  assert.deepEqual(employee.permissions.filesystem.write, ["**/*"]);
});

test("lines are trimmed, deduplicated and handle CRLF", () => {
  assert.deepEqual(linesOf(" a \r\nb\n\n a\n"), ["a", "b"]);
});

test("a copy gets a new id and name, and ids are derived from names", () => {
  const copy = copyFormValues(SAMPLE);
  assert.equal(copy.id, "payments-lead-copy");
  assert.equal(copy.name, "Payments Lead copy");
  assert.equal(idFromName("  2 Senior API/Owner! "), "senior-api-owner");
});

test("a preferred rung that is also required is dropped", () => {
  const fields = toEmployeeFields({ ...toFormValues(SAMPLE), preferredRungs: ["typecheck", "lint"] });
  assert.deepEqual(fields["verification"], { required: ["typecheck"], preferred: ["lint"] });
});
