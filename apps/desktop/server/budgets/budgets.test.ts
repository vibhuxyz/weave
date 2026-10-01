import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ServerMessage } from "../shared/index.ts";
import { createRunController } from "../parallel-run/index.ts";
import { loadBudgets } from "./budget-file.ts";
import { handleBudgetMessage } from "./handle-budget-message.ts";
import { usdText } from "./settings.ts";

async function project(): Promise<string> {
  return mkdtemp(join(tmpdir(), "weave-budgets-"));
}

async function run(projectDir: string, msg: Parameters<typeof handleBudgetMessage>[0]): Promise<ServerMessage[]> {
  const sent: ServerMessage[] = [];
  await handleBudgetMessage(msg, { projectDir, send: (message) => sent.push(message) });
  return sent;
}

test("a project with no limits file has no limits and nothing spent", async () => {
  const [message] = await run(await project(), { type: "read-budgets" });
  assert.deepEqual(message, { type: "budgets", settings: {}, spent: { costUsd: "0.00", tokens: 0, wallMs: 0, runs: 0 }, issue: null });
});

test("saved limits are validated, normalised on disk and read back", async () => {
  const dir = await project();
  const settings = { run: { maxCostUsd: "2.5", maxWallMs: 600_000 }, engine: { codex: { maxTokens: 50_000 } } };
  const sent = await run(dir, { type: "save-budgets", requestId: "r1", settings });
  assert.deepEqual(sent.map((message) => message.type), ["budgets", "budgets-saved"]);
  assert.deepEqual(JSON.parse(await readFile(join(dir, ".weave", "budgets.json"), "utf8")), { run: { maxCostUsd: "2.50", maxWallMs: 600_000 }, engine: { codex: { maxTokens: 50_000 } } });
  const loaded = await loadBudgets(dir);
  assert.ok(loaded.ok);
  assert.equal(loaded.budgets.run?.maxCostMicroUsd, 2_500_000n);
});

test("invalid limits are refused with core's reason and nothing is written", async () => {
  const dir = await project();
  const [message] = await run(dir, { type: "save-budgets", requestId: "r1", settings: { task: { maxTokens: -1, maxCostUsd: "lots" } } });
  assert.ok(message?.type === "budgets-save-failed");
  assert.match(message.message, /maxCostUsd must be a decimal string/);
  assert.match(message.message, /maxTokens must be a positive integer/);
  assert.deepEqual(await loadBudgets(dir), { ok: true, budgets: {} });
});

test("a broken limits file is reported and stops a run from starting", async () => {
  const dir = await project();
  await mkdir(join(dir, ".weave"), { recursive: true });
  await writeFile(join(dir, ".weave", "budgets.json"), "{ not json");
  const [message] = await run(dir, { type: "read-budgets" });
  assert.ok(message?.type === "budgets");
  assert.match(message.issue ?? "", /not valid JSON/);
  const sent: ServerMessage[] = [];
  const runs = createRunController(async () => ({ status: "no-change-needed", reason: "unused" }), { readBudgets: loadBudgets, prepareRepo: async () => ({ ok: true, setupSummary: null }) });
  await runs.start({ request: "go", projectDir: dir, engineId: "claude-code", runKey: "k1", send: (msg) => sent.push(msg) });
  assert.deepEqual(sent.map((msg) => msg.type), ["run-started", "run-finished"]);
  const finished = sent[1];
  assert.ok(finished?.type === "run-finished" && finished.outcome.status === "error");
  assert.match(finished.outcome.reason, /Cannot start a parallel run: .*budgets\.json is not valid JSON/);
});

test("a limits file that links outside the project is refused", async () => {
  const dir = await project();
  const outside = join(await project(), "elsewhere.json");
  await writeFile(outside, "{}");
  await mkdir(join(dir, ".weave"), { recursive: true });
  await symlink(outside, join(dir, ".weave", "budgets.json"));
  const loaded = await loadBudgets(dir);
  assert.ok(!loaded.ok);
  assert.match(loaded.message, /resolves outside the project/);
});

test("dollar amounts keep cents and drop trailing zeros", () => {
  assert.equal(usdText(0n), "0.00");
  assert.equal(usdText(2_500_000n), "2.50");
  assert.equal(usdText(1_234_567n), "1.234567");
});
