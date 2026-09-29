import type { VerificationRung } from "@weave/protocol";
import { VERIFICATION_RUNGS, rungStrength } from "@weave/protocol";
import { readGitStatus } from "../shared/index.ts";
import { detectPackageManager, readHead, readPackageJson } from "./detect.ts";
import { ecosystemRungs } from "./ecosystems.ts";
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

function describeExecution(execution: RungExecution): string {
  return execution.via === "diff-review" ? "structural diff review" : `\`${execution.command}\``;
}

function addEcosystemRungs(cwd: string, ctx: RungDetectionContext): void {
  for (const entry of ecosystemRungs(cwd)) ctx.add(entry.rung, entry.execution, entry.why);
}

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

  const nodeFirst = pkg !== null;
  if (!nodeFirst) addEcosystemRungs(cwd, ctx);

  detectTests(ctx);
  detectSmoke(ctx);
  detectHealth(ctx);
  detectBoot(ctx);
  detectBuild(ctx);
  detectTypecheck(ctx);
  detectLint(ctx);
  if (nodeFirst) addEcosystemRungs(cwd, ctx);
  ctx.add("diff-review", { via: "diff-review" } satisfies RungExecution, "always available");

  const chosen = new Map<VerificationRung, DetectedRung>();
  for (const entry of detected) {
    const held = chosen.get(entry.rung);
    if (held) {
      missing.push({ rung: entry.rung, why: `${describeExecution(entry.execution)} was not used: ${describeExecution(held.execution)} already covers ${entry.rung}` });
      continue;
    }
    chosen.set(entry.rung, entry);
  }

  return {
    cwd,
    isGitRepo: status.branch !== null,
    branch: status.branch,
    head: await readHead(cwd),
    clean: status.changes.length === 0,
    packageManager: pm,
    hasPackageJson: pkg !== null,
    detected: [...chosen.values()],
    missing: missing.sort((a, b) => rungStrength(b.rung) - rungStrength(a.rung) || a.why.localeCompare(b.why)),
  };
}

export const ALL_RUNGS = VERIFICATION_RUNGS;
