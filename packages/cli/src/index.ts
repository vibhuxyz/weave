#!/usr/bin/env node
/**
 * berd — drive the orchestrator without a window.
 *
 *   berd run --dir ./repo --prompt "fix the failing test"
 *   berd run --dir ./repo --tasks tasks.json
 *   berd replay <runId> [--dir ./repo]
 *   berd runs [--dir ./repo]
 */

import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  berdDirFor,
  newRunId,
  readLedger,
  runTask,
  runTasks,
  Ledger,
  SessionStore,
} from "@berd/core";
import type { BerdEvent, TaskContract } from "@berd/protocol";

interface Flags {
  dir: string;
  prompt?: string;
  tasks?: string;
  resume: boolean;
  model?: string;
  json: boolean;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { dir: process.cwd(), resume: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dir") flags.dir = resolve(argv[++i] ?? ".");
    else if (arg === "--prompt") flags.prompt = argv[++i];
    else if (arg === "--tasks") flags.tasks = resolve(argv[++i] ?? "");
    else if (arg === "--model") flags.model = argv[++i];
    else if (arg === "--resume") flags.resume = true;
    else if (arg === "--json") flags.json = true;
  }
  return flags;
}

/** One line per event, so a run is readable as it happens. */
function printEvent(event: BerdEvent): void {
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
    case "error":
      console.error(`  error [${event.where}] ${event.message}`);
      return;
    default:
      return;
  }
}

async function cmdRun(flags: Flags): Promise<number> {
  const berdDir = berdDirFor(flags.dir);
  const store = new SessionStore(berdDir);

  if (flags.tasks) {
    const raw = await readFile(flags.tasks, "utf8");
    const parsed = JSON.parse(raw) as TaskContract[];
    const tasks = parsed.map((task) => ({
      ...task,
      cwd: task.cwd ? resolve(task.cwd) : flags.dir,
    }));
    const { runId, results, ledgerFile } = await runTasks(tasks, {
      agentConfig: flags.model ? { model: flags.model } : undefined,
    });
    console.log(`\nrun ${runId}\n${ledgerFile}`);
    if (flags.json) console.log(JSON.stringify(results, null, 2));
    return results.every((entry) => entry.status === "ok") ? 0 : 1;
  }

  if (!flags.prompt) {
    console.error("berd run: need --prompt or --tasks");
    return 2;
  }

  const task: TaskContract = {
    id: "task-1",
    prompt: flags.prompt,
    cwd: flags.dir,
  };

  const ledger = new Ledger(berdDir, newRunId());
  console.log(`run ${ledger.runId}  ${flags.dir}`);

  const outcome = await runTask({
    task,
    ledger,
    onEvent: printEvent,
    resumeSessionId: flags.resume ? await store.get(flags.dir) : null,
    config: {
      agentConfig: flags.model ? { model: flags.model } : undefined,
    },
  });

  // Only after a completed turn — see SessionStore's note.
  if (outcome.result.status === "ok" && outcome.sessionId) {
    await store.set(flags.dir, outcome.sessionId);
  }

  console.log(`\nledger: ${outcome.ledgerFile}`);
  if (flags.json) console.log(JSON.stringify(outcome.result, null, 2));
  return outcome.result.status === "ok" ? 0 : 1;
}

async function cmdReplay(runId: string, flags: Flags): Promise<number> {
  const events = await readLedger(berdDirFor(flags.dir), runId);
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

async function cmdRuns(flags: Flags): Promise<number> {
  const dir = join(berdDirFor(flags.dir), "runs");
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
    case "runs":
      process.exit(await cmdRuns(flags));
      break;
    default:
      console.log(
        [
          "berd run    --dir <path> --prompt <text> [--model <id>] [--resume] [--json]",
          "berd run    --dir <path> --tasks <tasks.json>",
          "berd replay <runId> [--dir <path>] [--json]",
          "berd runs   [--dir <path>]",
        ].join("\n"),
      );
      process.exit(command ? 2 : 0);
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
