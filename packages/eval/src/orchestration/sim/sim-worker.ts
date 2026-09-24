import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Ledger, RunWorker } from "@weave/core";
import { uniform } from "./rng.ts";
import type { EngineTruth, SimTask, World } from "./types.ts";

export interface SimWorkerOptions {
  readonly world: World;
  readonly tasks: readonly SimTask[];
  readonly engineOrderFor: (taskId: string) => readonly string[];
}

type AttemptResult = "ok" | "failed" | "cancelled";

function sleep(ms: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const onAbort = (): void => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(true);
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function attempt(input: { readonly world: World; readonly engine: EngineTruth; readonly task: SimTask; readonly prompt: string; readonly ledger: Ledger; readonly signal: AbortSignal; readonly attemptIndex: number }): Promise<AttemptResult> {
  const { world, engine, task, ledger } = input;
  const wallMs = Math.round(task.sizeUnits * world.msPerUnit * engine.speedFactor);
  ledger.append("attempt.started", { taskId: task.id, attemptIndex: input.attemptIndex, engineId: engine.id, sessionId: "" });
  ledger.append("task.started", { taskId: task.id, cwd: "", prompt: input.prompt });
  const isFinished = await sleep(wallMs, input.signal);
  ledger.append("usage", { taskId: task.id, used: task.sizeUnits * 1_000, size: 200_000, costUsd: task.sizeUnits * engine.costUsdPerUnit });
  if (!isFinished) {
    ledger.append("task.finished", { taskId: task.id, status: "cancelled", wallMs });
    return "cancelled";
  }
  const isOk = uniform(world.seed, task.id, engine.id, task.kind, task.sizeUnits) < engine.successByKind[task.kind];
  ledger.append("task.finished", { taskId: task.id, status: isOk ? "ok" : "failed", wallMs });
  if (!isOk) ledger.append("attempt.ended", { taskId: task.id, attemptIndex: input.attemptIndex, endedBy: "agent_crash" });
  return isOk ? "ok" : "failed";
}

export function simWorker(options: SimWorkerOptions): RunWorker {
  const tasksById = new Map(options.tasks.map((task) => [task.id, task]));
  const enginesById = new Map(options.world.engines.map((engine) => [engine.id, engine]));
  return async ({ task: contract, ledger, signal }) => {
    const task = tasksById.get(contract.id);
    if (!task) return { status: "failed", error: `unknown simulated task ${contract.id}` };
    const engines = options.engineOrderFor(task.id).flatMap((engineId) => enginesById.get(engineId) ?? []);
    for (const [attemptIndex, engine] of engines.entries()) {
      const result = await attempt({ world: options.world, engine, task, prompt: contract.prompt, ledger, signal, attemptIndex });
      if (result === "cancelled") return { status: "cancelled", error: "run cancelled" };
      if (result === "failed") continue;
      const file = join(contract.cwd, task.directory, `${task.id.toLowerCase()}.ts`);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, `export const ${task.id} = "${engine.id}";\n`);
      return { status: "ok", finalMessage: `done by ${engine.id}` };
    }
    return { status: "failed", error: `every engine failed ${task.id}` };
  };
}
