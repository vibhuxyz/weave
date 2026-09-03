import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { VerificationRung } from "@weave/protocol";
import { VERIFICATION_RUNGS, rungStrength } from "@weave/protocol";
import { readGitStatus } from "./git.ts";

/**
 * Look at a repo and answer: what can we prove about it?
 *
 * Intake runs BEFORE the agent does. Its job is to find every rung of the
 * verification ladder the project already supports, so a run can be scored at
 * the strongest one instead of being refused for having no test suite.
 *
 * The rule this file exists to enforce: **never refuse a repo for having no
 * tests.** Greenfield scaffolds have no tests by definition, and they are the
 * path a new user hits first.
 *
 * Detection is deliberately shallow. It reads `package.json`, looks for config
 * files, and checks which binaries are actually installed. It never runs the
 * project, never guesses, and never invents a command that would hit the
 * network — an unattended 3am matrix run cannot afford an `npx` that decides
 * to download something.
 */

export type PackageManager = "pnpm" | "yarn" | "bun" | "npm";

/** How one rung gets executed. Not every rung is a shell exit code. */
export type RungExecution =
  /** Run a command; exit 0 is a pass. */
  | { via: "command"; command: string }
  /** Start a long-lived process; staying up for `holdMs` is a pass. */
  | { via: "boot"; command: string; holdMs: number }
  /** Structural sanity, computed in-process. No command to run. */
  | { via: "diff-review" };

export interface DetectedRung {
  rung: VerificationRung;
  strength: number;
  execution: RungExecution;
  /** How it was detected, e.g. `package.json scripts.test`. For the ledger. */
  why: string;
}

export interface MissingRung {
  rung: VerificationRung;
  /** Why it is unavailable. This reads as a to-do list for the project. */
  why: string;
}

export interface Intake {
  cwd: string;
  isGitRepo: boolean;
  branch: string | null;
  head: string | null;
  /** No uncommitted changes. Non-repos report `true` — nothing to be dirty. */
  clean: boolean;
  packageManager: PackageManager | null;
  hasPackageJson: boolean;
  detected: DetectedRung[];
  missing: MissingRung[];
}

/** Just the rung names, strongest last. */
export function availableRungs(intake: Intake): VerificationRung[] {
  return [...intake.detected]
    .sort((a, b) => a.strength - b.strength)
    .map((entry) => entry.rung);
}

/** The strongest detected rung, or null when nothing at all was detected. */
export function strongestDetected(intake: Intake): DetectedRung | null {
  return intake.detected.reduce<DetectedRung | null>(
    (best, entry) => (!best || entry.strength > best.strength ? entry : best),
    null,
  );
}

interface PackageJson {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

async function readPackageJson(cwd: string): Promise<PackageJson | null> {
  try {
    return JSON.parse(await readFile(join(cwd, "package.json"), "utf8")) as PackageJson;
  } catch {
    return null;
  }
}

function detectPackageManager(cwd: string): PackageManager | null {
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(cwd, "yarn.lock"))) return "yarn";
  if (existsSync(join(cwd, "bun.lockb")) || existsSync(join(cwd, "bun.lock"))) return "bun";
  if (existsSync(join(cwd, "package-lock.json"))) return "npm";
  return existsSync(join(cwd, "package.json")) ? "npm" : null;
}

/**
 * `npm run x` works everywhere and adds ~200ms. Using the detected manager
 * matters more than the overhead: a pnpm workspace's `test` script frequently
 * depends on pnpm's own linking, and running it under npm fails for reasons
 * that have nothing to do with the agent.
 */
function runScript(pm: PackageManager, script: string): string {
  return pm === "npm" ? `npm run --silent ${script}` : `${pm} run ${script}`;
}

/**
 * A `test` script that is npm's placeholder is not a test suite.
 *
 * `npm init` writes `echo "Error: no test specified" && exit 1`. Treating that
 * as rung 8 would score every un-tested project at the top of the ladder while
 * guaranteeing a fail — the single most damaging detection error possible here.
 */
function isPlaceholderTest(command: string): boolean {
  return /no test specified/i.test(command);
}

/** Is a CLI actually installed locally? Never assume; never reach the network. */
function localBin(cwd: string, name: string): string | null {
  const path = join(cwd, "node_modules", ".bin", name);
  return existsSync(path) ? path : null;
}

function hasAnyFile(cwd: string, names: string[]): string | null {
  return names.find((name) => existsSync(join(cwd, name))) ?? null;
}

const ESLINT_CONFIGS = [
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs",
  "eslint.config.ts",
  ".eslintrc",
  ".eslintrc.js",
  ".eslintrc.cjs",
  ".eslintrc.json",
  ".eslintrc.yml",
];

const COMPOSE_FILES = [
  "docker-compose.yml",
  "docker-compose.yaml",
  "compose.yml",
  "compose.yaml",
];

export interface IntakeOptions {
  /** Seconds a booted process must survive to count as a pass. */
  bootHoldMs?: number;
}

/**
 * Detect what this project can be verified with.
 *
 * Order of the returned list is irrelevant — `strength` decides. What matters
 * is that every rung is reported with the exact command that will run, so the
 * ledger records a claim that can be re-executed by hand.
 */
export async function intake(
  cwd: string,
  options: IntakeOptions = {},
): Promise<Intake> {
  const holdMs = options.bootHoldMs ?? 5000;
  const pkg = await readPackageJson(cwd);
  const pm = detectPackageManager(cwd);
  const scripts = pkg?.scripts ?? {};
  const status = await readGitStatus(cwd);

  const detected: DetectedRung[] = [];
  const missing: MissingRung[] = [];

  const add = (rung: VerificationRung, execution: RungExecution, why: string) =>
    detected.push({ rung, strength: rungStrength(rung), execution, why });
  const skip = (rung: VerificationRung, why: string) => missing.push({ rung, why });

  // ── 8 tests ────────────────────────────────────────────────────────────
  if (pm && scripts.test && !isPlaceholderTest(scripts.test)) {
    add("tests", { via: "command", command: runScript(pm, "test") }, "package.json scripts.test");
  } else if (scripts.test) {
    skip("tests", "scripts.test is npm's placeholder, not a suite");
  } else {
    skip("tests", "no scripts.test");
  }

  // ── 7 smoke ────────────────────────────────────────────────────────────
  // A scripted request flow. Never inferred: if the project does not declare
  // one, we do not have one. For greenfield this is generated at plan time
  // from the blueprint (MVP.2), never after the code lands.
  if (pm && scripts.smoke) {
    add("smoke", { via: "command", command: runScript(pm, "smoke") }, "package.json scripts.smoke");
  } else {
    skip("smoke", "no scripts.smoke");
  }

  // ── 6 health ───────────────────────────────────────────────────────────
  const compose = hasAnyFile(cwd, COMPOSE_FILES);
  if (compose) {
    add(
      "health",
      { via: "command", command: "docker compose up --wait --quiet-pull" },
      `${compose} with docker compose --wait`,
    );
  } else {
    skip("health", "no docker compose file");
  }

  // ── 5 boot ─────────────────────────────────────────────────────────────
  // `start` only. `dev` is deliberately excluded: dev servers watch, restart
  // on change, and frequently stay up through a compile error — which would
  // make this rung pass on broken code.
  if (pm && scripts.start) {
    add("boot", { via: "boot", command: runScript(pm, "start"), holdMs }, "package.json scripts.start");
  } else {
    skip("boot", "no scripts.start");
  }

  // ── 4 build ────────────────────────────────────────────────────────────
  if (pm && scripts.build) {
    add("build", { via: "command", command: runScript(pm, "build") }, "package.json scripts.build");
  } else {
    skip("build", "no scripts.build");
  }

  // ── 3 typecheck ────────────────────────────────────────────────────────
  const typecheckScript =
    (scripts.typecheck && "typecheck") ??
    (scripts["check-types"] && "check-types") ??
    (scripts["type-check"] && "type-check") ??
    null;
  const tsconfig = hasAnyFile(cwd, ["tsconfig.json"]);
  if (pm && typecheckScript) {
    add(
      "typecheck",
      { via: "command", command: runScript(pm, typecheckScript) },
      `package.json scripts.${typecheckScript}`,
    );
  } else if (tsconfig && localBin(cwd, "tsc")) {
    add(
      "typecheck",
      { via: "command", command: `${localBin(cwd, "tsc")} --noEmit` },
      "tsconfig.json + local typescript",
    );
  } else if (tsconfig) {
    skip("typecheck", "tsconfig.json present but typescript is not installed");
  } else {
    skip("typecheck", "no tsconfig.json and no typecheck script");
  }

  // ── 2 lint ─────────────────────────────────────────────────────────────
  const eslintConfig = hasAnyFile(cwd, ESLINT_CONFIGS);
  if (pm && scripts.lint) {
    add("lint", { via: "command", command: runScript(pm, "lint") }, "package.json scripts.lint");
  } else if (eslintConfig && localBin(cwd, "eslint")) {
    add(
      "lint",
      { via: "command", command: `${localBin(cwd, "eslint")} .` },
      `${eslintConfig} + local eslint`,
    );
  } else {
    skip("lint", "no lint script and no local eslint config");
  }

  // ── 1 diff-review ──────────────────────────────────────────────────────
  // ALWAYS available. That is the point of the ladder having a floor: there is
  // no repo we cannot say anything about. It is weak evidence and it is
  // labelled as weak, which is a different thing from no evidence.
  add("diff-review", { via: "diff-review" }, "always available");

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

async function readHead(cwd: string): Promise<string | null> {
  const { spawn } = await import("node:child_process");
  return new Promise((done) => {
    const child = spawn("git", ["rev-parse", "HEAD"], {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
    });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => (out += chunk.toString()));
    child.on("error", () => done(null));
    child.on("close", (code) => done(code === 0 ? out.trim() : null));
  });
}

/** Every rung, for rendering a full ladder with gaps shown. */
export const ALL_RUNGS = VERIFICATION_RUNGS;
