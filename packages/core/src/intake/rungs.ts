import type { VerificationRung } from "@weave/protocol";
import {
  COMPOSE_FILES,
  ESLINT_CONFIGS,
  hasAnyFile,
  isPlaceholderTest,
  localBin,
  runScript,
} from "./detect.ts";
import type { PackageManager, RungExecution } from "./types.ts";

export interface RungDetectionContext {
  cwd: string;
  pm: PackageManager | null;
  scripts: Record<string, string>;
  holdMs: number;
  add: (rung: VerificationRung, execution: RungExecution, why: string) => void;
  skip: (rung: VerificationRung, why: string) => void;
}

export function detectTests(ctx: RungDetectionContext): void {
  const { pm, scripts, add, skip } = ctx;
  if (pm && scripts.test && !isPlaceholderTest(scripts.test)) {
    add("tests", { via: "command", command: runScript(pm, "test") }, "package.json scripts.test");
  } else if (scripts.test) {
    skip("tests", "scripts.test is npm's placeholder, not a suite");
  } else {
    skip("tests", "no scripts.test");
  }
}

export function detectSmoke(ctx: RungDetectionContext): void {
  const { pm, scripts, add, skip } = ctx;
  if (pm && scripts.smoke) {
    add("smoke", { via: "command", command: runScript(pm, "smoke") }, "package.json scripts.smoke");
  } else {
    skip("smoke", "no scripts.smoke");
  }
}

export function detectHealth(ctx: RungDetectionContext): void {
  const { cwd, add, skip } = ctx;
  const compose = hasAnyFile(cwd, COMPOSE_FILES);
  if (!compose) {
    skip("health", "no docker compose file");
    return;
  }
  add(
    "health",
    {
      via: "command",
      command: "docker compose up --wait --quiet-pull",
      teardown: {
        command: "docker compose stop",
        skipIfOutput: "docker compose ps --status running --quiet",
      },
    },
    `${compose} with docker compose --wait`,
  );
}

export function detectBoot(ctx: RungDetectionContext): void {
  const { pm, scripts, holdMs, add, skip } = ctx;
  if (pm && scripts.start) {
    add("boot", { via: "boot", command: runScript(pm, "start"), holdMs }, "package.json scripts.start");
  } else {
    skip("boot", "no scripts.start");
  }
}

export function detectBuild(ctx: RungDetectionContext): void {
  const { pm, scripts, add, skip } = ctx;
  if (pm && scripts.build) {
    add("build", { via: "command", command: runScript(pm, "build") }, "package.json scripts.build");
  } else {
    skip("build", "no scripts.build");
  }
}

function typecheckScriptName(scripts: Record<string, string>): string | null {
  if (scripts.typecheck) return "typecheck";
  if (scripts["check-types"]) return "check-types";
  if (scripts["type-check"]) return "type-check";
  return null;
}

export function detectTypecheck(ctx: RungDetectionContext): void {
  const { cwd, pm, scripts, add, skip } = ctx;
  const scriptName = typecheckScriptName(scripts);
  const tsconfig = hasAnyFile(cwd, ["tsconfig.json"]);
  if (pm && scriptName) {
    add("typecheck", { via: "command", command: runScript(pm, scriptName) }, `package.json scripts.${scriptName}`);
    return;
  }
  const tsc = tsconfig ? localBin(cwd, "tsc") : null;
  if (tsc) {
    add("typecheck", { via: "command", command: `${tsc} --noEmit` }, "tsconfig.json + local typescript");
  } else if (tsconfig) {
    skip("typecheck", "tsconfig.json present but typescript is not installed");
  } else {
    skip("typecheck", "no tsconfig.json and no typecheck script");
  }
}

export function detectLint(ctx: RungDetectionContext): void {
  const { cwd, pm, scripts, add, skip } = ctx;
  const eslintConfig = hasAnyFile(cwd, ESLINT_CONFIGS);
  const eslintBin = eslintConfig ? localBin(cwd, "eslint") : null;
  if (pm && scripts.lint) {
    add("lint", { via: "command", command: runScript(pm, "lint") }, "package.json scripts.lint");
  } else if (eslintConfig && eslintBin) {
    add("lint", { via: "command", command: `${eslintBin} .` }, `${eslintConfig} + local eslint`);
  } else {
    skip("lint", "no lint script and no local eslint config");
  }
}
