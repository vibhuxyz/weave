import type { Verification } from "@weave/protocol";
import { rungStrength, verificationOf } from "@weave/protocol";
import { runBoot, runCommand } from "./run-command.ts";
import { runDiffReview } from "./diff-review.ts";
import { intake as runIntake, availableRungs, type DetectedRung } from "../intake/index.ts";
import type { RungRun, VerifyOptions, VerifyOutcome } from "./types.ts";

export { runCommand, runBoot } from "./run-command.ts";
export { runDiffReview } from "./diff-review.ts";
export type { RungRun, VerifyOptions, VerifyOutcome } from "./types.ts";

export async function runDetectedRung(
  entry: DetectedRung,
  cwd: string,
  options: VerifyOptions,
): Promise<RungRun> {
  const started = Date.now();
  const exec = entry.execution;
  const teardown = exec.via === "command" ? exec.teardown : undefined;

  const preexisting = teardown
    ? (await runCommand(teardown.skipIfOutput, cwd, options.timeoutMs)).output.trim().length > 0
    : false;

  const result =
    exec.via === "command"
      ? await runCommand(exec.command, cwd, options.timeoutMs)
      : exec.via === "boot"
        ? await runBoot(exec.command, cwd, exec.holdMs)
        : await runDiffReview(cwd, options.baseline);

  const wallMs = Date.now() - started;

  if (teardown && !preexisting) {
    await runCommand(teardown.command, cwd, options.timeoutMs);
  }

  return {
    rung: entry.rung,
    strength: entry.strength,
    command:
      exec.via === "diff-review"
        ? "(structural sanity, in-process)"
        : exec.command,
    ok: result.ok,
    code: result.code,
    wallMs,
    output: result.output,
  };
}

async function verifyExplicitCommand(
  cwd: string,
  options: VerifyOptions,
  available: ReturnType<typeof availableRungs>,
  intake: Awaited<ReturnType<typeof runIntake>>,
): Promise<VerifyOutcome> {
  const rung = options.rung;
  if (!rung) {
    throw new Error(
      "verifyRepo: `command` requires `rung`. A verification whose strength " +
        "is unknown cannot be compared with anything.",
    );
  }
  const run = await runDetectedRung(
    {
      rung,
      strength: rungStrength(rung),
      execution: { via: "command", command: options.command as string },
      why: "explicit",
    },
    cwd,
    options,
  );
  options.onRung?.(run);
  return {
    ok: run.ok,
    verification: verificationOf(available, [rung]),
    runs: [run],
    intake,
  };
}

export async function verifyRepo(
  cwd: string,
  options: VerifyOptions = {},
): Promise<VerifyOutcome> {
  const intake = options.intake ?? (await runIntake(cwd));
  const available = availableRungs(intake);

  if (options.command) {
    return verifyExplicitCommand(cwd, options, available, intake);
  }

  const chosen = intake.detected.reduce<DetectedRung | null>(
    (best, entry) => (!best || entry.strength > best.strength ? entry : best),
    null,
  );

  if (!chosen) {
    return {
      ok: false,
      verification: verificationOf(available, []),
      runs: [],
      intake,
    };
  }

  const run = await runDetectedRung(chosen, cwd, options);
  options.onRung?.(run);

  return {
    ok: run.ok,
    verification: verificationOf(available, [chosen.rung]),
    runs: [run],
    intake,
  };
}

export function describeVerification(verification: Verification): string {
  if (verification.used.length === 0) return "unverified (0)";
  return `${verification.used.join("+")} (${verification.strength})`;
}
