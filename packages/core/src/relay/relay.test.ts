import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { TaskContract } from "@weave/protocol";
import { readLatest } from "../checkpoint/index.ts";
import { buildProjectModel } from "../context/index.ts";
import { marketplaceRepo } from "../context/testing.ts";
import { Ledger } from "../shared/index.ts";
import { afterAttempt, lifecycleStage } from "./lifecycle.ts";
import { relayTask } from "./relay.ts";
import type { AttemptInput, AttemptOutcome } from "./types.ts";

const ENGINES = ["claude-code", "codex", "gemini", "opencode"];
const PRIVATE_CHATTER = "PRIVATE-PROVIDER-HISTORY";
const notes = (decision: string) => `${PRIVATE_CHATTER}\n\`\`\`json\n{ "taskNotes": { "decisions": ["${decision}"] } }\n\`\`\``;

interface Script {
  readonly write?: string;
  readonly outcome: Pick<AttemptOutcome, "status" | "error">;
  readonly decision: string;
}

const SCRIPT: Readonly<Record<string, Script>> = {
  "claude-code": { write: "apps/api/src/payouts/currency.ts", decision: "Use ISO 4217 codes", outcome: { status: "failed", error: "rate limit exceeded (429)" } },
  codex: { decision: "Validate in createSellerPayout", outcome: { status: "failed", error: "engine process exited unexpectedly" } },
  gemini: { decision: "Reject unknown currencies with 422", outcome: { status: "failed", error: "Quota exceeded for this model" } },
  opencode: { write: "apps/api/src/payouts/currency.test.ts", decision: "Covered by currency.test.ts", outcome: { status: "ok", error: null } },
};

function scriptedEngines(seen: { engineId: string; cwd: string; prompt: string }[]) {
  return async ({ engineId, task, ledger }: AttemptInput): Promise<AttemptOutcome> => {
    seen.push({ engineId, cwd: task.cwd, prompt: task.prompt });
    const script = SCRIPT[engineId];
    assert.ok(script, engineId);
    ledger.append("task.started", { taskId: task.id, cwd: task.cwd, prompt: task.prompt });
    ledger.append("agent.message", { taskId: task.id, update: { sessionUpdate: "plan", entries: [{ content: "Add currency type", status: "completed" }, { content: "Validate currency", status: engineId === "opencode" ? "completed" : "pending" }] } });
    ledger.append("agent.message", { taskId: task.id, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: notes(script.decision) } } });
    if (script.write) {
      await writeFile(join(task.cwd, script.write), `export const WRITTEN_BY = "${engineId}";\n`);
      ledger.append("file.written", { taskId: task.id, path: script.write, bytes: 1 });
    }
    ledger.append("task.finished", { taskId: task.id, status: script.outcome.status === "ok" ? "ok" : "failed", wallMs: 1 });
    return { ...script.outcome, stoppedBy: null, contextUsed: null, contextSize: null, finalMessage: notes(script.decision) };
  };
}

test("exit condition: one task moves Claude → Codex → Gemini → OpenCode on the same worktree and TaskState", async () => {
  const root = await marketplaceRepo();
  const weaveDir = join(root, ".weave");
  const { model } = await buildProjectModel({ root });
  const ledger = new Ledger(weaveDir, "relay-run");
  const task: TaskContract = { id: "PAYOUT", prompt: "Change the seller payout API to accept a currency", cwd: root, allowedPaths: ["apps/api/**"] };
  const seen: { engineId: string; cwd: string; prompt: string }[] = [];
  const result = await relayTask({ task, engines: ENGINES, weaveDir, ledger, model, runAttempt: scriptedEngines(seen) });

  assert.equal(result.status, "ok");
  assert.deepEqual(result.attempts.map((attempt) => [attempt.engineId, attempt.endedBy]), [["claude-code", "provider_limit"], ["codex", "agent_crash"], ["gemini", "provider_limit"], ["opencode", null]]);
  assert.ok(seen.every((attempt) => attempt.cwd === root));
  assert.doesNotMatch(seen[0]?.prompt ?? "", /<task-state>/);
  for (const [index, attempt] of seen.slice(1).entries()) {
    assert.match(attempt.prompt, /<task-state>[\s\S]*apps\/api\/src\/payouts\/currency\.ts[\s\S]*Use ISO 4217 codes[\s\S]*NEXT STEP\nValidate currency/, `attempt ${index + 1}`);
    assert.doesNotMatch(attempt.prompt, new RegExp(PRIVATE_CHATTER));
    assert.match(attempt.prompt, /<project-context[\s\S]*payout/);
  }
  assert.match(seen[3]?.prompt ?? "", /Reject unknown currencies with 422/);
  assert.equal(await readFile(join(root, "apps/api/src/payouts/currency.ts"), "utf8"), 'export const WRITTEN_BY = "claude-code";\n');
  assert.deepEqual(result.state.changedFiles.modified, ["apps/api/src/payouts/currency.ts", "apps/api/src/payouts/currency.test.ts"]);
  assert.equal(result.state.decisions.length, 4);
  assert.equal(result.state.status, "completed");
  assert.equal(result.state.contextVersion, 1);
  const checkpoint = await readLatest(weaveDir, "PAYOUT");
  assert.equal(checkpoint?.reason, "provider_limit");
  assert.equal(checkpoint?.state.engineState.attempts, 3);
});

test("the lifecycle escalates with context use, and stop reasons pick the next move", () => {
  const at = (ratio: number) => lifecycleStage({ contextUsed: ratio * 1000, contextSize: 1000, isProviderLimited: false, isEngineDown: false });
  assert.deepEqual([0.1, 0.55, 0.7, 0.8, 0.9].map(at), ["normal", "compress-tool-output", "trim-history", "summarize", "reconstruct"]);
  assert.equal(lifecycleStage({ contextUsed: null, contextSize: null, isProviderLimited: true, isEngineDown: false }), "handoff");
  const base: AttemptOutcome = { status: "failed", stoppedBy: null, error: null, contextUsed: null, contextSize: null, finalMessage: "" };
  assert.deepEqual(afterAttempt({ ...base, stoppedBy: "maxTurns", status: "cancelled" }), { move: "same-engine", reason: "max_turns" });
  assert.deepEqual(afterAttempt({ ...base, status: "cancelled", stoppedBy: "aborted" }), { move: "stop", reason: "user_cancellation" });
  assert.deepEqual(afterAttempt({ ...base, status: "cancelled", contextUsed: 900, contextSize: 1000 }), { move: "same-engine", reason: "explicit_handoff" });
  assert.deepEqual(afterAttempt({ ...base, error: "You exceeded your current quota" }), { move: "next-engine", reason: "provider_limit" });
  assert.deepEqual(afterAttempt({ ...base, status: "ok" }), { move: "done", reason: null });
});
