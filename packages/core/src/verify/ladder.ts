import type { VerificationRung } from "@weave/protocol";
import { rungStrength } from "@weave/protocol";
import { ecosystemsFor } from "../intake/ecosystems.ts";
import type { DetectedRung, Intake } from "../intake/index.ts";

export const VERIFICATION_LAYERS = ["task", "integration", "build", "repository"] as const;

export type VerificationLayer = (typeof VERIFICATION_LAYERS)[number];

export interface LayerStep {
  readonly layer: VerificationLayer;
  readonly rung: VerificationRung;
  readonly command: string;
  readonly why: string;
}

export interface SkippedLayer {
  readonly layer: VerificationLayer;
  readonly why: string;
}

export interface LadderPlan {
  readonly steps: readonly LayerStep[];
  readonly skipped: readonly SkippedLayer[];
}

export interface PlanVerificationInput {
  readonly cwd: string;
  readonly intake: Intake;
  readonly changedFiles: readonly string[];
  readonly relatedFiles?: readonly string[];
}

const BUILD_RUNGS: readonly VerificationRung[] = ["typecheck", "build"];

function detectedFor(intake: Intake, rung: VerificationRung): DetectedRung | undefined {
  return intake.detected.find((entry) => entry.rung === rung);
}

function commandOf(entry: DetectedRung | undefined): string | null {
  if (!entry) return null;
  return entry.execution.via === "command" ? entry.execution.command : null;
}

function scopedTestCommand(cwd: string, paths: readonly string[]): string | null {
  if (paths.length === 0) return null;
  for (const ecosystem of ecosystemsFor(cwd)) {
    const command = ecosystem.scopedTests?.(paths);
    if (command) return command;
  }
  return null;
}

function nodeScopedTests(intake: Intake, paths: readonly string[]): string | null {
  const tests = commandOf(detectedFor(intake, "tests"));
  if (!tests || paths.length === 0) return null;
  return /\b(vitest|jest)\b/.test(tests) ? `${tests} -- ${paths.join(" ")}` : null;
}

function testLayer(
  layer: VerificationLayer,
  input: PlanVerificationInput,
  paths: readonly string[],
  steps: LayerStep[],
  skipped: SkippedLayer[],
): void {
  if (paths.length === 0) {
    skipped.push({ layer, why: `no ${layer === "task" ? "changed" : "related"} file to narrow the suite to` });
    return;
  }
  const command = scopedTestCommand(input.cwd, paths) ?? nodeScopedTests(input.intake, paths);
  if (!command) {
    skipped.push({ layer, why: "this project has no path-scoped test command" });
    return;
  }
  steps.push({ layer, rung: "tests", command, why: `${paths.length} path(s) in scope` });
}

export function planVerification(input: PlanVerificationInput): LadderPlan {
  const steps: LayerStep[] = [];
  const skipped: SkippedLayer[] = [];
  const changed = [...new Set(input.changedFiles)].sort();
  const related = [...new Set(input.relatedFiles ?? [])].filter((path) => !changed.includes(path)).sort();

  testLayer("task", input, changed, steps, skipped);
  testLayer("integration", input, related, steps, skipped);

  const build = BUILD_RUNGS.map((rung) => detectedFor(input.intake, rung)).filter(
    (entry): entry is DetectedRung => entry !== undefined,
  );
  if (build.length === 0) skipped.push({ layer: "build", why: "no typecheck or build step was detected" });
  for (const entry of build.sort((a, b) => rungStrength(a.rung) - rungStrength(b.rung))) {
    const command = commandOf(entry);
    if (command) steps.push({ layer: "build", rung: entry.rung, command, why: entry.why });
  }

  const full = detectedFor(input.intake, "tests");
  const fullCommand = commandOf(full);
  if (full && fullCommand) {
    steps.push({ layer: "repository", rung: "tests", command: fullCommand, why: full.why });
  } else {
    skipped.push({ layer: "repository", why: "no repository-wide test suite was detected" });
  }

  return { steps, skipped };
}
