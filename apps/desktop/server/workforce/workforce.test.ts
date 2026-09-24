import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ServerMessage } from "../shared/index.ts";
import { handleWorkforceMessage } from "./handle-workforce.ts";

async function project(): Promise<{ readonly projectDir: string; readonly weaveHome: string }> {
  const root = await mkdtemp(join(tmpdir(), "weave-workforce-"));
  const projectDir = join(root, "shop");
  await mkdir(join(projectDir, "api"), { recursive: true });
  await writeFile(join(projectDir, "package.json"), JSON.stringify({ name: "shop", scripts: { test: "node --test" } }));
  await writeFile(join(projectDir, "api", "payouts.ts"), "export function createSellerPayout(amount: number) { return amount; }\n");
  return { projectDir, weaveHome: join(root, "home") };
}

async function run(message: Parameters<typeof handleWorkforceMessage>[0], paths: { readonly projectDir: string; readonly weaveHome: string }): Promise<readonly ServerMessage[]> {
  const sent: ServerMessage[] = [];
  await handleWorkforceMessage(message, { ...paths, send: (reply) => sent.push(reply) });
  return sent;
}

test("the desktop lists, creates, customises and deletes employees through the registry", async () => {
  const paths = await project();
  const [listed] = await run({ type: "list-employees" }, paths);
  assert.equal(listed?.type, "employees");
  const ids = listed?.type === "employees" ? listed.employees.map((employee) => employee.id) : [];
  assert.deepEqual(ids, ["backend-engineer", "database-engineer", "devops-engineer", "frontend-engineer", "qa-engineer", "security-engineer"]);
  const draft = { id: "payments-engineer", name: "Payments Engineer", responsibilities: ["payouts"], permissions: { filesystem: { write: ["api/**"] } }, verification: { required: ["tests"] } };
  const saved = await run({ type: "save-employee", draft }, paths);
  assert.equal(saved[0]?.type, "employee-saved");
  const after = saved[1]?.type === "employees" ? saved[1].employees.find((employee) => employee.id === "payments-engineer") : undefined;
  assert.deepEqual([after?.source, after?.permissions.write, after?.verification.required], ["project", ["api/**"], ["tests"]]);
  assert.match(after?.brief ?? "", /<employee id="payments-engineer"/);
  const invalid = await run({ type: "save-employee", draft: { id: "Bad Id", name: "x" } }, paths);
  assert.match(invalid[0]?.type === "employee-error" ? invalid[0].message : "", /Cannot save employee: .*"id" has an invalid format/);
  const deleted = await run({ type: "delete-employee", employeeId: "payments-engineer" }, paths);
  assert.equal(deleted[0]?.type, "employee-saved");
  const refused = await run({ type: "delete-employee", employeeId: "qa-engineer" }, paths);
  assert.match(refused[0]?.type === "employee-error" ? refused[0].message : "", /built-ins cannot be deleted/);
});

test("skills show which employees use them, and the project model answers a request", async () => {
  const paths = await project();
  const [skills] = await run({ type: "list-skills" }, paths);
  const typescript = skills?.type === "skills" ? skills.skills.find((skill) => skill.name === "typescript") : undefined;
  assert.ok(typescript?.usedBy.includes("backend-engineer"));
  const [model] = await run({ type: "project-model", request: "Change the seller payout" }, paths);
  assert.equal(model?.type, "project-model");
  if (model?.type !== "project-model") return;
  assert.ok(model.model.counts.files >= 2);
  assert.ok(model.model.query?.files.some((file) => file.path === "api/payouts.ts"));
  assert.ok(model.model.query?.symbols.includes("createSellerPayout"));
});
