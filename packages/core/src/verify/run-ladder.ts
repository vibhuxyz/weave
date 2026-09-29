import { verificationOf } from "@weave/protocol";
import { rungStrength } from "@weave/protocol";
import { availableRungs } from "../intake/index.ts";
import { runCommand } from "./run-command.ts";
import type { LadderPlan, LayerStep } from "./ladder.ts";
import type { RungRun, VerifyOptions } from "./types.ts";
import type { Intake } from "../intake/index.ts";

export interface LayerRun extends RungRun {
  readonly layer: LayerStep["layer"];
}

export interface LadderOutcome {
  readonly ok: boolean;
  readonly runs: readonly LayerRun[];
  readonly stoppedAt: LayerStep["layer"] | null;
  readonly notRun: readonly LayerStep[];
  readonly verification: ReturnType<typeof verificationOf>;
}

export interface RunLadderOptions extends VerifyOptions {
  readonly onLayer?: (run: LayerRun) => void;
}

export async function runLadder(
  plan: LadderPlan,
  cwd: string,
  intake: Intake,
  options: RunLadderOptions = {},
): Promise<LadderOutcome> {
  const runs: LayerRun[] = [];

  for (let index = 0; index < plan.steps.length; index += 1) {
    const step = plan.steps[index];
    if (!step) continue;
    const started = Date.now();
    const result = await runCommand(step.command, cwd, options.timeoutMs);
    const run: LayerRun = {
      layer: step.layer,
      rung: step.rung,
      strength: rungStrength(step.rung),
      command: step.command,
      ok: result.ok,
      code: result.code,
      wallMs: Date.now() - started,
      output: result.output,
    };
    runs.push(run);
    options.onLayer?.(run);
    options.onRung?.(run);
    if (!run.ok) {
      return {
        ok: false,
        runs,
        stoppedAt: step.layer,
        notRun: plan.steps.slice(index + 1),
        verification: verificationOf(availableRungs(intake), []),
      };
    }
  }

  return {
    ok: true,
    runs,
    stoppedAt: null,
    notRun: [],
    verification: verificationOf(availableRungs(intake), [...new Set(runs.map((run) => run.rung))]),
  };
}
