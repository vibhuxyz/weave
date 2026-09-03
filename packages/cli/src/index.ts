#!/usr/bin/env node
/**
 * weave — drive the orchestrator without a window.
 *
 *   weave run --dir ./repo --prompt "fix the failing test"
 *   weave run --dir ./repo --tasks tasks.json
 *   weave intake --dir ./repo
 *   weave replay <runId> [--dir ./repo]
 *   weave runs [--dir ./repo]
 */

import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  weaveDirFor,
  newRunId,
  readLedger,
  runTask,
  runTasks,
  Ledger,
  SessionStore,
  intake,
  availableRungs,
  describeVerification,
} from "@weave/core";
import type { WeaveEvent, CellResult, TaskContract } from "@weave/protocol";

interface Flags {
  dir: string;
  prompt?: string;
  tasks?: string;
  fixtures?: string;
  repeats?: number;
  resume: boolean;
  model?: string;
  json: boolean;
  /** Skip the verification ladder after `run`. */
  noVerify: boolean;
}

/**
 * Where the user actually typed the command.
 *
 * `pnpm -F @weave/cli start` runs with cwd = packages/cli, so `--dir .` would
 * silently mean the wrong directory. pnpm sets INIT_CWD to the invocation
 * directory; honour it so relative paths mean what they look like.
 */
const userCwd = process.env.INIT_CWD ?? process.cwd();
const fromUser = (path: string) => resolve(userCwd, path);

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { dir: userCwd, resume: false, json: false, noVerify: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dir") flags.dir = fromUser(argv[++i] ?? ".");
    else if (arg === "--prompt") flags.prompt = argv[++i];
    else if (arg === "--tasks") flags.tasks = fromUser(argv[++i] ?? "");
    else if (arg === "--model") flags.model = argv[++i];
    else if (arg === "--fixtures") flags.fixtures = fromUser(argv[++i] ?? "");
    else if (arg === "--repeats") flags.repeats = Number(argv[++i] ?? "3");
    else if (arg === "--resume") flags.resume = true;
    else if (arg === "--json") flags.json = true;
    else if (arg === "--no-verify") flags.noVerify = true;
  }
  return flags;
}

/** One line per event, so a run is readable as it happens. */
function printEvent(event: WeaveEvent): void {
  switch (event.type) {
    case "agent.session":
      console.log(
        `  session ${event.sessionId.slice(0, 8)} ${event.resumed ? "(resumed)" : "(new)"}`,
      );
      return;
    case "agent.message": {
      const update = event.update as { sessionUpdate?: string; title?: string };
      if (update.sessionUpdate === "tool_call_update" && update.title) {
        console.log(`  · ${update.title}`);
      }
      return;
    }
    case "permission.decided":
      console.log(
        `  ${event.decision === "allow" ? "allow" : "REJECT"}  ${event.toolCall} — ${event.reason}`,
      );
      return;
    case "file.written":
      console.log(`  wrote ${event.path} (${event.bytes}b)`);
      return;
    case "task.finished":
      console.log(`  ${event.status} in ${event.wallMs}ms`);
      return;
    case "intake.detected":
      console.log(
        `  ladder: ${event.available.length} rung(s) — ${event.available.join(", ")}`,
      );
      return;
    case "verification.rung":
      console.log(
        `  verify ${event.ok ? "PASS" : "FAIL"}  ${event.rung} (${event.strength})` +
          `  ${(event.wallMs / 1000).toFixed(1)}s  ${event.command}`,
      );
      return;
    case "error":
      console.error(`  error [${event.where}] ${event.message}`);
      return;
    default:
      return;
  }
}

async function cmdRun(flags: Flags): Promise<number> {
  const weaveDir = weaveDirFor(flags.dir);
  const store = new SessionStore(weaveDir);

  if (flags.tasks) {
    const raw = await readFile(flags.tasks, "utf8");
    const parsed = JSON.parse(raw) as TaskContract[];
    const tasks = parsed.map((task) => ({
      ...task,
      cwd: task.cwd ? resolve(task.cwd) : flags.dir,
    }));
    const { runId, results, ledgerFile } = await runTasks(tasks, {
      model: flags.model,
    });
    console.log(`\nrun ${runId}\n${ledgerFile}`);
    if (flags.json) console.log(JSON.stringify(results, null, 2));
    return results.every((entry) => entry.status === "ok") ? 0 : 1;
  }

  if (!flags.prompt) {
    console.error("weave run: need --prompt or --tasks");
    return 2;
  }

  const task: TaskContract = {
    id: "task-1",
    prompt: flags.prompt,
    cwd: flags.dir,
  };

  const ledger = new Ledger(weaveDir, newRunId());
  console.log(`run ${ledger.runId}  ${flags.dir}`);

  const outcome = await runTask({
    task,
    ledger,
    onEvent: printEvent,
    resumeSessionId: flags.resume ? await store.get(flags.dir) : null,
    config: { model: flags.model },
    verifyAfter: !flags.noVerify,
  });

  // Only after a completed turn — see SessionStore's note.
  if (outcome.result.status === "ok" && outcome.sessionId) {
    await store.set(flags.dir, outcome.sessionId);
  }

  console.log(`\nledger: ${outcome.ledgerFile}`);
  if (outcome.result.verification) {
    // The rung, always. A result without it cannot be compared with another.
    console.log(`verified at: ${describeVerification(outcome.result.verification)}`);
  }
  if (flags.json) console.log(JSON.stringify(outcome.result, null, 2));
  return outcome.result.status === "ok" ? 0 : 1;
}

/**
 * `weave intake` — what can this repo be verified with?
 *
 * Exists so the ladder is inspectable without running an agent. The missing
 * rungs are printed with the reason, which turns the output into a to-do list:
 * "no scripts.start" is a thing you can go and fix.
 */
async function cmdIntake(flags: Flags): Promise<number> {
  const { renderLadder } = await import("@weave/eval");
  const detected = await intake(flags.dir);

  if (flags.json) {
    console.log(JSON.stringify(detected, null, 2));
    return 0;
  }

  console.log(`${flags.dir}`);
  console.log(
    `  git: ${detected.isGitRepo ? `${detected.branch} @ ${detected.head?.slice(0, 8)}` : "not a repo"}` +
      `${detected.isGitRepo && !detected.clean ? " (dirty)" : ""}` +
      `   package manager: ${detected.packageManager ?? "none"}`,
  );
  console.log("");
  console.log(renderLadder(availableRungs(detected), detected.missing));
  console.log("");

  const strongest = detected.detected.reduce(
    (best, entry) => (!best || entry.strength > best.strength ? entry : best),
    detected.detected[0],
  );
  console.log(
    `strongest available: ${strongest.rung} (${strongest.strength}) — ${strongest.why}`,
  );
  return 0;
}

async function cmdReplay(runId: string, flags: Flags): Promise<number> {
  const events = await readLedger(weaveDirFor(flags.dir), runId);
  if (flags.json) {
    console.log(JSON.stringify(events, null, 2));
    return 0;
  }
  for (const event of events) {
    console.log(`${String(event.seq).padStart(4)} ${event.at} ${event.type}`);
    printEvent(event);
  }
  console.log(`\n${events.length} events`);
  return 0;
}

async function cmdEval(flags: Flags): Promise<number> {
  if (!flags.fixtures) {
    console.error("weave eval: need --fixtures <tasks.json>");
    return 2;
  }

  const { loadFixtures, runMatrix, renderMatrix, renderSummaryJson } =
    await import("@weave/eval");

  const { fixtures, configs } = await loadFixtures(flags.fixtures);
  const repeats = flags.repeats ?? 3;

  console.log(
    `${fixtures.length} fixtures x ${configs.length} configs x ${repeats} repeats` +
      ` = ${fixtures.length * configs.length * repeats} cells, sequential\n`,
  );

  const cells = await runMatrix({
    fixtures,
    configs,
    repeats,
    onCell: (cell: CellResult) => {
      const mark = cell.status === "pass" ? "pass" : cell.status.toUpperCase();
      console.log(
        `  ${cell.fixtureId} [${cell.configId}] #${cell.repeat}  ${mark}` +
          `  ${(cell.wallMs / 1000).toFixed(1)}s  ${cell.turns} turns` +
          (cell.error ? `  - ${cell.error}` : ""),
      );
    },
  });

  console.log("\n" + renderMatrix(cells));
  if (flags.json) console.log(JSON.stringify(renderSummaryJson(cells), null, 2));

  // Non-zero when anything did not pass, so this is usable as a CI gate.
  return cells.every((cell) => cell.status === "pass") ? 0 : 1;
}

async function cmdRuns(flags: Flags): Promise<number> {
  const dir = join(weaveDirFor(flags.dir), "runs");
  try {
    const entries = await readdir(dir);
    for (const entry of entries.sort()) console.log(entry);
  } catch {
    console.log("(no runs yet)");
  }
  return 0;
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);

  switch (command) {
    case "run":
      process.exit(await cmdRun(flags));
      break;
    case "replay":
      process.exit(await cmdReplay(rest[0] ?? "", parseFlags(rest.slice(1))));
      break;
    case "eval":
      process.exit(await cmdEval(flags));
      break;
    case "intake":
      process.exit(await cmdIntake(flags));
      break;
    case "runs":
      process.exit(await cmdRuns(flags));
      break;
    default:
      console.log(
        [
          "weave run    --dir <path> --prompt <text> [--model <id>] [--resume] [--no-verify] [--json]",
          "weave run    --dir <path> --tasks <tasks.json>",
          "weave intake --dir <path> [--json]",
          "weave replay <runId> [--dir <path>] [--json]",
          "weave eval   --fixtures <tasks.json> [--repeats <n>] [--json]",
          "weave runs   [--dir <path>]",
        ].join("\n"),
      );
      process.exit(command ? 2 : 0);
  } 
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
