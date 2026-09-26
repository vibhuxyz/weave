import test from "node:test";
import assert from "node:assert/strict";
import { triageRequest } from "./triage.ts";
import type { TriageInput } from "./types.ts";

const FILES = new Set(["README.md", "apps/web/src/Header.tsx", "apps/api/src/auth/login.ts"]);

function triage(request: string, overrides: Partial<TriageInput> = {}) {
  return triageRequest({ request, kind: "existing", filePaths: FILES, ...overrides });
}

test("a typo fix in one existing file skips planning", () => {
  assert.deepEqual(triage("Fix the typo in README.md"), {
    route: "fast", path: "README.md", reason: "typo fix in one existing file",
    classification: { taskType: "docs", scope: "single-file", risk: "low", domains: [] },
  });
  assert.equal(triage("change the label text in `./apps/web/src/Header.tsx`.").route, "fast");
});

test("small edits that name no file, several files, or a missing file go to the planner", () => {
  assert.match(triage("Fix the typo on the pricing page").reason, /names 0 files/);
  assert.match(triage("Fix typos in README.md and apps/web/src/Header.tsx").reason, /names 2 files/);
  assert.match(triage("Fix the typo in docs/guide.md").reason, /not a file in this project/);
});

test("anything sensitive, long, multi-line, new or not a small edit goes to the planner", () => {
  assert.match(triage("Fix the typo in apps/api/src/auth/login.ts").reason, /sensitive/);
  assert.match(triage(`Fix the typo in README.md ${"x".repeat(200)}`).reason, /longer than one short line/);
  assert.match(triage("Fix the typo in README.md\nand also refactor the header").reason, /longer than one short line/);
  assert.match(triage("Fix the typo in README.md", { kind: "greenfield" }).reason, /new project/);
  assert.match(triage("Build seller payouts in README.md").reason, /not a recognised small edit/);
  assert.equal(triage("Rename Header to TopBar in apps/web/src/Header.tsx").route, "plan");
});
