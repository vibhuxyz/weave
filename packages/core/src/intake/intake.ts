import type { VerificationRung } from "@weave/protocol";
import { VERIFICATION_RUNGS, rungStrength } from "@weave/protocol";
import { readGitStatus } from "../shared/index.ts";
import { detectPackageManager, readHead, readPackageJson } from "./detect.ts";
import {
  detectBoot,
  detectBuild,
  detectHealth,
  detectLint,
  detectSmoke,
  detectTests,
  detectTypecheck,
  type RungDetectionContext,
} from "./rungs.ts";
import type { DetectedRung, Intake, IntakeOptions, RungExecution } from "./types.ts";

export type {
  DetectedRung,
  Intake,
  IntakeOptions,
  MissingRung,
  PackageManager,
  RungExecution,
  RungTeardown,
} from "./types.ts";

const DEFAULT_BOOT_HOLD_MS = 5000;

export function availableRungs(intake: Intake): VerificationRung[] {
  return [...intake.detected]
    .sort((a, b) => a.strength - b.strength)
    .map((entry) => entry.rung);
}

export function strongestDetected(intake: Intake): DetectedRung | null {
  return intake.detected.reduce<DetectedRung | null>(
    (best, entry) => (!best || entry.strength > best.strength ? entry : best),
    null,
  );
}

export async function intake(
  cwd: string,
  options: IntakeOptions = {},
): Promise<Intake> {
  const holdMs = options.bootHoldMs ?? DEFAULT_BOOT_HOLD_MS;
  const pkg = await readPackageJson(cwd);
  const pm = detectPackageManager(cwd);
  const scripts = pkg?.scripts ?? {};
  const status = await readGitStatus(cwd);

  const detected: DetectedRung[] = [];
  const missing: Intake["missing"] = [];
  const ctx: RungDetectionContext = {
    cwd,
    pm,
    scripts,
    holdMs,
    add: (rung, execution, why) => detected.push({ rung, strength: rungStrength(rung), execution, why }),
    skip: (rung, why) => missing.push({ rung, why }),
  };

  detectTests(ctx);
  detectSmoke(ctx);
  detectHealth(ctx);
  detectBoot(ctx);
  detectBuild(ctx);
  detectTypecheck(ctx);
  detectLint(ctx);
  ctx.add("diff-review", { via: "diff-review" } satisfies RungExecution, "always available");

  return {
    cwd,
    isGitRepo: status.branch !== null,
    branch: status.branch,
    head: await readHead(cwd),
    clean: status.changes.length === 0,
    packageManager: pm,
    hasPackageJson: pkg !== null,
    detected,
    missing: missing.sort((a, b) => rungStrength(b.rung) - rungStrength(a.rung)),
  };
}

export const ALL_RUNGS = VERIFICATION_RUNGS;
