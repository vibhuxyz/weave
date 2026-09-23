import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { openSession, type AgentSession } from "@weave/agent";
import { CompactionController, compactBeforePrompt, runCompaction } from "../../server/compaction/index.ts";
import { Recorder, indexOfLabel } from "./recorder.ts";

const WARMUP_PROMPTS = ["Reply with exactly: one", "Reply with exactly: two", "Reply with exactly: three"] as const;
const CAPABILITY_WAIT_MS = 15_000;
const POLL_MS = 250;
const CANCEL_AFTER_MS = 1_500;
const ALWAYS_COMPACT_THRESHOLD = 0.000_001;

const { values } = parseArgs({
  options: { engine: { type: "string", default: "claude-code" }, out: { type: "string" } },
});
const engineId = values.engine ?? "claude-code";
const recorder = new Recorder();
const failures: string[] = [];

function check(label: string, passed: boolean): void {
  recorder.client(`${passed ? "PASS" : "FAIL"} ${label}`);
  if (!passed) failures.push(label);
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  return predicate();
}

async function turn(session: AgentSession, controller: CompactionController, text: string): Promise<void> {
  recorder.client(`prompt ${JSON.stringify(text)}`);
  const { stopReason } = await session.prompt([{ type: "text", text }]);
  recorder.client(`turn-end ${stopReason}`);
  controller.recordTurnCompleted(session.sessionId);
}

async function scenarioManual(session: AgentSession, controller: CompactionController): Promise<void> {
  for (const text of WARMUP_PROMPTS) await turn(session, controller, text);
  const result = await runCompaction({
    controller, session, operationId: "smoke-manual", trigger: "manual", promptId: null,
    send: (msg) => recorder.server(msg),
  });
  check("manual compaction ran", result.kind === "ran");
  check("manual compaction completed", result.kind === "ran" && result.outcome.status === "completed");
}

async function scenarioAutomatic(session: AgentSession, controller: CompactionController): Promise<void> {
  await turn(session, controller, "Reply with exactly: four");
  const from = recorder.events.length;
  const preflight = await compactBeforePrompt({
    controller, session, promptId: "smoke-prompt", threshold: ALWAYS_COMPACT_THRESHOLD,
    send: (msg) => recorder.server(msg), newOperationId: () => "smoke-auto",
  });
  check("automatic compaction let the prompt proceed", preflight.kind === "proceed");
  await turn(session, controller, "Reply with exactly: five");
  const labels = recorder.labels().slice(from);
  const started = indexOfLabel(labels, "server: compaction started");
  const settled = indexOfLabel(labels, "server: compaction completed", started);
  const prompt = indexOfLabel(labels, "client: prompt", settled);
  check("order: started → completed → prompt", started >= 0 && settled > started && prompt > settled);
}

async function scenarioCancel(session: AgentSession, controller: CompactionController): Promise<void> {
  await turn(session, controller, "Reply with exactly: six");
  const running = runCompaction({
    controller, session, operationId: "smoke-cancel", trigger: "manual", promptId: null,
    send: (msg) => recorder.server(msg),
  });
  setTimeout(() => {
    recorder.client("cancel");
    void session.cancel();
  }, CANCEL_AFTER_MS);
  const result = await running;
  const status = result.kind === "ran" ? result.outcome.status : "duplicate";
  check(`cancel settles as cancelled or finished first (got ${status})`, status === "cancelled" || status === "completed");
}

async function main(): Promise<void> {
  const cwd = await mkdtemp(join(tmpdir(), "weave-compact-smoke-"));
  const controller = new CompactionController((sessionId, supports) =>
    recorder.server({ type: "session-capabilities", sessionId, supportsCompaction: supports }),
  );
  const session = await openSession({
    engineId,
    task: { id: "compaction-smoke", prompt: "", cwd, sandboxed: false },
    sink: {
      onUpdate: (update, replay, sessionId) => {
        recorder.engine(update);
        controller.observe(update, { sessionId, isReplay: replay });
      },
      onPermission: () => undefined,
      onFileRead: () => undefined,
      onFileWritten: () => undefined,
      onSpawned: (pid) => recorder.client(`spawned ${engineId} pid ${pid}`),
      onSession: (id) => recorder.client(`session ${id}`),
      onCapabilities: () => undefined,
    },
  });
  try {
    const advertised = await waitFor(() => controller.stateFor(session.sessionId).supportsCompaction, CAPABILITY_WAIT_MS);
    check("engine advertises /compact", advertised);
    if (advertised) {
      await scenarioManual(session, controller);
      await scenarioAutomatic(session, controller);
      await scenarioCancel(session, controller);
    }
  } finally {
    session.close();
  }
  const out = values.out ?? join(cwd, `compaction-smoke-${engineId}.json`);
  await writeFile(out, JSON.stringify({ engineId, failures, events: recorder.events }, null, 2));
  console.log(`\nRecording: ${out}\n${failures.length === 0 ? "ALL PASSED" : `FAILED: ${failures.join("; ")}`}`);
  process.exitCode = failures.length === 0 ? 0 : 1;
}

await main();
