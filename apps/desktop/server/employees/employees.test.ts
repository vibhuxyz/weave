import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ServerMessage } from "../shared/index.ts";
import { handleEmployeeMessage } from "./handle-employee-message.ts";
import { validateEmployeeFields } from "./employee-fields.ts";

const BUILTIN_ID = "backend-engineer";

async function project(): Promise<string> {
  return mkdtemp(join(tmpdir(), "weave-employees-"));
}

async function run(projectDir: string, msg: Parameters<typeof handleEmployeeMessage>[0]): Promise<ServerMessage[]> {
  const sent: ServerMessage[] = [];
  await handleEmployeeMessage(msg, { projectDir, skillDirs: [], send: (message) => sent.push(message) });
  return sent;
}

function listingOf(sent: readonly ServerMessage[]) {
  const listing = sent.find((message) => message.type === "employees");
  assert.ok(listing?.type === "employees", "expected an employees listing");
  return listing;
}

test("lists the six built-ins for a project with no employee files", async () => {
  const listing = listingOf(await run(await project(), { type: "list-employees" }));
  assert.equal(listing.entries.length, 6);
  assert.ok(listing.entries.every((entry) => entry.employee.source === "builtin" && entry.overrides === null));
});

test("customizing a built-in writes a project file that overrides it, and deleting resets it", async () => {
  const dir = await project();
  const fields = { id: BUILTIN_ID, name: "Payments Backend", responsibilities: ["payments api"] };
  const saved = await run(dir, { type: "save-employee", requestId: "r1", fields, replacesId: BUILTIN_ID });
  assert.deepEqual(saved.at(-1), { type: "employee-changed", requestId: "r1", id: BUILTIN_ID });
  const customized = listingOf(saved).entries.find((entry) => entry.employee.id === BUILTIN_ID);
  assert.equal(customized?.employee.name, "Payments Backend");
  assert.equal(customized?.overrides, "builtin");
  assert.deepEqual(await readdir(join(dir, ".weave", "employees")), [`${BUILTIN_ID}.json`]);

  const deleted = await run(dir, { type: "delete-employee", requestId: "r2", id: BUILTIN_ID });
  assert.equal(listingOf(deleted).entries.find((entry) => entry.employee.id === BUILTIN_ID)?.employee.source, "builtin");
  assert.deepEqual(await readdir(join(dir, ".weave", "employees")), []);
});

test("a new employee cannot take an id that is already in use", async () => {
  const sent = await run(await project(), { type: "save-employee", requestId: "r1", fields: { id: BUILTIN_ID, name: "Clash" }, replacesId: null });
  assert.equal(sent[0]?.type, "employee-change-failed");
});

test("renaming a project employee removes its old file, including YAML", async () => {
  const dir = await project();
  await mkdir(join(dir, ".weave", "employees"), { recursive: true });
  await writeFile(join(dir, ".weave", "employees", "api-owner.yaml"), "id: api-owner\nname: API Owner\n");
  const sent = await run(dir, { type: "save-employee", requestId: "r1", fields: { id: "api-lead", name: "API Lead" }, replacesId: "api-owner" });
  assert.equal(sent.at(-1)?.type, "employee-changed");
  assert.deepEqual(await readdir(join(dir, ".weave", "employees")), ["api-lead.json"]);
});

test("built-ins cannot be deleted", async () => {
  const sent = await run(await project(), { type: "delete-employee", requestId: "r1", id: BUILTIN_ID });
  assert.equal(sent[0]?.type, "employee-change-failed");
});

test("the detail carries the rendered brief and rejects unknown ids without touching the disk", async () => {
  const dir = await project();
  const [detail] = await run(dir, { type: "read-employee", id: BUILTIN_ID });
  assert.ok(detail?.type === "employee-detail");
  assert.match(detail.detail.brief, /^<employee id="backend-engineer" source="builtin">/);
  const [missing] = await run(dir, { type: "read-employee", id: "../../etc/passwd" });
  assert.equal(missing?.type, "employee-detail-failed");
});

test("field validation rejects extends, bad ids and unknown fields, and omits a null engine allow-list", () => {
  assert.equal(validateEmployeeFields({ id: "a", name: "A", extends: BUILTIN_ID }).ok, false);
  assert.equal(validateEmployeeFields({ id: "Not Kebab", name: "A" }).ok, false);
  assert.equal(validateEmployeeFields({ id: "a", name: "A", surprise: true }).ok, false);
  const valid = validateEmployeeFields({ id: "a", name: "A" });
  assert.ok(valid.ok);
  assert.equal("allowed" in (JSON.parse(valid.fileText) as { engines: object }).engines, false);
});
