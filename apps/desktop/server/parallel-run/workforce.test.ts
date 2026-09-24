import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { planAndRun, runGit, type RunWorker, type TurnRunner, type VerifyWorkspace } from "@weave/core";
import type { WeaveEvent } from "@weave/protocol";
import type { ServerMessage } from "../shared/index.ts";
import { MAX_CLAIMS_SHOWN } from "./constants.ts";
import { projectRunEvent } from "./project-event.ts";
import { createRunController } from "./run-controller.ts";

const BASE = { runId: "r1", seq: 1, at: "2026-09-25T00:00:00.000Z" } as const;
const eventOf = (fields: object): WeaveEvent => ({ ...BASE, ...fields }) as WeaveEvent;
const ENVELOPE = { id: "e1", version: 1, seq: 1, occurredAt: BASE.at, correlationId: "c1", from: "T1" } as const;

test("employee, ownership and dependency events become lane updates", () => {
  assert.deepEqual(projectRunEvent(eventOf({ type: "employee.assigned", taskId: "T1", employeeId: "qa-engineer", score: 4, reasons: ["tests\nmatch"] })), { kind: "employee-assigned", taskId: "T1", employeeId: "qa-engineer", reasons: ["tests match"] });
  assert.deepEqual(projectRunEvent(eventOf({ type: "ownership.blocked", taskId: "T2", conflicts: ["T1 owns file:a.ts"] })), { kind: "blocked", taskId: "T2", reason: "Waiting for T1 owns file:a.ts" });
  assert.deepEqual(projectRunEvent(eventOf({ type: "dependency.added", taskId: "T2", on: "T1", outputs: ["api"], reason: "needs api" })), { kind: "dependency-added", taskId: "T2", on: "T1", reason: "needs api" });
  assert.equal(projectRunEvent(eventOf({ type: "ownership.released", taskId: "T1" })), null);
});

test("claims are capped with a count of the rest", () => {
  const resources = Array.from({ length: MAX_CLAIMS_SHOWN + 5 }, (_, index) => ({ kind: "file", id: `f${index}.ts` }));
  const update = projectRunEvent(eventOf({ type: "ownership.claimed", taskId: "T1", resources }));
  assert.ok(update?.kind === "claimed");
  assert.equal(update.resources.length, MAX_CLAIMS_SHOWN + 1);
  assert.equal(update.resources.at(-1), "(+5 more)");
});

test("coordination events summarise blocks, early starts and escalations for the right lane", () => {
  const blocked = eventOf({ type: "coordination.event", recipients: [], event: { ...ENVELOPE, type: "dependency.blocked", data: { need: { output: "schema", task: "T0" }, reason: "not published" } } });
  assert.deepEqual(projectRunEvent(blocked), { kind: "blocked", taskId: "T1", reason: "Needs schema from T0: not published" });
  const ready = eventOf({ type: "coordination.event", recipients: ["T3"], event: { ...ENVELOPE, type: "dependency.ready", data: { consumer: "T3", outputs: ["api"] } } });
  assert.deepEqual(projectRunEvent(ready), { kind: "note", taskId: "T3", tone: "info", text: "Can start early: api ready from T1" });
  const escalation = eventOf({ type: "coordination.event", recipients: [], event: { ...ENVELOPE, type: "escalation.created", data: { subject: "cycle", reason: "T1 -> T2 -> T1" } } });
  assert.equal(projectRunEvent(escalation)?.kind, "note");
});

test("orchestration decisions and budget overruns become run updates", () => {
  const decided = eventOf({ type: "orchestration.decided", workers: 2, reason: "history", benefitMs: { timeSaved: 5000, coordination: 1, mergeRisk: 1, verification: 1, startup: 1, total: 4996 }, estimatedCostMicroUsd: "120000", tasks: [] });
  assert.deepEqual(projectRunEvent(decided), { kind: "orchestration", workers: 2, reason: "history", estimatedCostMicroUsd: "120000", timeSavedMs: 5000 });
  const exceeded = eventOf({ type: "budget.exceeded", scope: "run", key: "r1", dimension: "time", limit: "60000", spent: "61000", action: "stop-run" });
  assert.equal(projectRunEvent(exceeded)?.kind, "budget-exceeded");
});

async function staffedProject(): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), "weave-run-staff-"));
  await runGit(repo, ["init", "--quiet", "--initial-branch=main"]);
  await writeFile(join(repo, ".gitignore"), ".weave/\n");
  await writeFile(join(repo, "package.json"), JSON.stringify({ scripts: { test: "node -e 0" } }));
  await runGit(repo, ["add", "-A"]);
  await runGit(repo, ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", "init"]);
  return repo;
}

test("a desktop run staffs tasks with employees and streams their assignment and checks", async () => {
  const repo = await staffedProject();
  const plan = { tasks: [{ id: "T1", title: "Tests", prompt: "Add regression tests for test coverage", allowedPaths: ["tests/a.test.js"], employee: "qa-engineer" }] };
  const runTurn: TurnRunner = async () => `\`\`\`json\n${JSON.stringify(plan)}\n\`\`\``;
  const runWorker: RunWorker = async ({ task }) => {
    const file = join(task.cwd, task.allowedPaths?.[0] ?? "x");
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, "ok");
    return { status: "ok", finalMessage: "done" };
  };
  const verify: VerifyWorkspace = async () => ({ ok: true, rungs: ["tests"], detail: "ok" });
  const scripted: typeof planAndRun = (options) => planAndRun({ ...options, runTurn, runWorker, verify, shouldInstall: false });
  const sent: ServerMessage[] = [];
  await createRunController(scripted).start({ request: "add tests", projectDir: repo, engineId: "claude-code", runKey: "k1", send: (message) => sent.push(message) });
  const kinds = sent.flatMap((message) => (message.type === "run-update" ? [message.update.kind] : []));
  assert.ok(kinds.includes("employee-assigned"), kinds.join(","));
  const assigned = sent.find((message) => message.type === "run-update" && message.update.kind === "employee-assigned");
  assert.ok(assigned?.type === "run-update" && assigned.update.kind === "employee-assigned");
  assert.equal(assigned.update.employeeId, "qa-engineer");
  assert.ok(kinds.includes("employee-verified"), kinds.join(","));
  assert.ok(kinds.includes("orchestration"), kinds.join(","));
  assert.equal(sent.at(-1)?.type, "run-finished");
});
