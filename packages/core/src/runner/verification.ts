import type { TaskContract, Verification, WeaveEvent } from "@weave/protocol";
import { intake as runIntake, availableRungs } from "../intake/index.ts";
import { verifyRepo } from "../verify/index.ts";
import type { Ledger } from "../shared/index.ts";

const RUNG_OUTPUT_TAIL_CHARS = 2000;

export async function runVerificationLadder(
  task: TaskContract,
  ledger: Ledger,
  emit: (event: WeaveEvent) => void,
): Promise<Verification> {
  const detected = await runIntake(task.cwd);
  emit(
    ledger.append("intake.detected", {
      taskId: task.id,
      cwd: task.cwd,
      isGitRepo: detected.isGitRepo,
      head: detected.head,
      available: availableRungs(detected),
      missing: detected.missing,
    }),
  );

  const outcome = await verifyRepo(task.cwd, {
    command: task.verify,
    rung: task.verifyRung,
    intake: detected,
    onRung: (run) =>
      emit(
        ledger.append("verification.rung", {
          taskId: task.id,
          rung: run.rung,
          strength: run.strength,
          command: run.command,
          ok: run.ok,
          wallMs: run.wallMs,
          output: run.output.slice(-RUNG_OUTPUT_TAIL_CHARS),
        }),
      ),
  });

  emit(
    ledger.append("verification.finished", {
      taskId: task.id,
      ok: outcome.ok,
      available: outcome.verification.available,
      used: outcome.verification.used,
      strength: outcome.verification.strength,
    }),
  );

  return outcome.verification;
}
