import { spawn } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, extname } from "node:path";
import type { Verification, VerificationRung } from "@weave/protocol";
import { rungStrength, verificationOf } from "@weave/protocol";
import { intake as runIntake, availableRungs, type DetectedRung, type Intake } from "./intake.ts";

/**
 * Run the verification ladder and report WHICH RUNG validated the result.
 *
 * The one rule that makes this honest, and it is easy to get wrong:
 *
 * > **A failing rung is a failure. It is never a reason to try a weaker one.**
 *
 * Falling down the ladder on failure would turn every red test suite into a
 * green `diff-review`, and the pass rate would climb as the agent got worse.
 * The ladder chooses a rung *before* running, based on what the project
 * supports — not after, based on what passed.
 */

export interface RungRun {
  rung: VerificationRung;
  strength: number;
  /** The exact command, so a surprising result can be reproduced by hand. */
  command: string;
  ok: boolean;
  code: number | null;
  wallMs: number;
  /** Tail of combined output. */
  output: string;
}

export interface VerifyOutcome {
  ok: boolean;
  verification: Verification;
  runs: RungRun[];
  intake: Intake;
}

export interface VerifyOptions {
  /**
   * An explicit command, overriding detection — what a fixture's `verify`
   * field becomes. `rung` MUST accompany it: a command whose strength is
   * unknown cannot be compared with anything.
   */
  command?: string;
  rung?: VerificationRung;
  /** Reuse an intake already taken, rather than detecting twice. */
  intake?: Intake;
  /** Pristine copy of the repo, enabling diff-review's deletion checks. */
  baseline?: string;
  timeoutMs?: number;
  onRung?: (run: RungRun) => void;
}

const OUTPUT_TAIL = 8000;

/** Run a shell command; exit 0 is a pass. Output captured, never inherited. */
export function runCommand(
  command: string,
  cwd: string,
  timeoutMs = 5 * 60 * 1000,
): Promise<{ ok: boolean; code: number | null; output: string }> {
  return new Promise((done) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    const collect = (chunk: Buffer) => {
      output += chunk.toString();
      if (output.length > OUTPUT_TAIL) output = output.slice(-OUTPUT_TAIL);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);

    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      done({ ok: false, code: null, output: String(error) });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      done({ ok: code === 0, code, output });
    });
  });
}

/**
 * Rung 5: start the process and see whether it stays up.
 *
 * "Stays up" is the whole assertion. A server that crashes on a missing env
 * var exits in the first second; one that boots clean sits there. The hold is
 * short on purpose — this rung is cheap evidence, not a soak test.
 *
 * Killed with SIGKILL on the whole process group. A dev server that spawns
 * children and is merely SIGTERMed leaves them holding the port, and the next
 * cell in the matrix then fails for a reason that has nothing to do with it.
 */
export function runBoot(
  command: string,
  cwd: string,
  holdMs: number,
): Promise<{ ok: boolean; code: number | null; output: string }> {
  return new Promise((done) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });

    let output = "";
    let settled = false;
    const collect = (chunk: Buffer) => {
      output += chunk.toString();
      if (output.length > OUTPUT_TAIL) output = output.slice(-OUTPUT_TAIL);
    };
    child.stdout?.on("data", collect);
    child.stderr?.on("data", collect);

    const finish = (ok: boolean, code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      killTree(child.pid);
      done({ ok, code, output });
    };

    // Exiting before the hold elapses is the failure this rung detects.
    child.on("error", (error) => {
      output += String(error);
      finish(false, null);
    });
    child.on("exit", (code) => finish(false, code));

    const timer = setTimeout(() => finish(true, null), holdMs);
  });
}

function killTree(pid: number | undefined): void {
  if (!pid) return;
  try {
    // Negative pid = the process group, created by `detached: true`.
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Already gone. Nothing to clean up.
    }
  }
}

const SOURCE_EXTENSIONS = new Set([".js", ".mjs", ".cjs"]);
const SKIP_DIRS = new Set(["node_modules", ".git", ".weave", "dist", "build", ".next", "coverage"]);

async function walk(dir: string, root = dir, out: string[] = []): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".env.example") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walk(full, root, out);
    } else if (entry.isFile()) {
      out.push(relative(root, full));
    }
  }
  return out;
}

const EXPORT_PATTERN =
  /export\s+(?:default|(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)|class\s+([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*))/g;

function exportsOf(source: string): Set<string> {
  const names = new Set<string>();
  for (const match of source.matchAll(EXPORT_PATTERN)) {
    const name = match[1] ?? match[2] ?? match[3];
    if (name) names.add(name);
  }
  // `export { a, b as c }` — the braced form, which the pattern above misses.
  for (const match of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of match[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) names.add(name);
    }
  }
  return names;
}

/**
 * Rung 1: structural sanity. The floor of the ladder.
 *
 * Deliberately weak and deliberately never absent. It answers three questions
 * that need no test suite, no build, and no running process:
 *
 *   - does every source file still parse?
 *   - did a file that used to exist disappear?
 *   - did a symbol that used to be exported stop being exported?
 *
 * The last two need `baseline` — a pristine copy of the repo. Without one only
 * the parse check runs, and the result says so rather than pretending.
 *
 * It exists so that "this repo has nothing we can check" is never true. Weak
 * evidence labelled as weak is a different thing from no evidence.
 */
export async function runDiffReview(
  cwd: string,
  baseline?: string,
): Promise<{ ok: boolean; code: number | null; output: string }> {
  const problems: string[] = [];
  const notes: string[] = [];

  const current = await walk(cwd);
  const sources = current.filter((path) => SOURCE_EXTENSIONS.has(extname(path)));

  for (const path of sources) {
    const check = await runCommand(
      `node --check ${JSON.stringify(join(cwd, path))}`,
      cwd,
      30_000,
    );
    // Only a genuine parse error counts. `node --check` can exit non-zero for
    // environmental reasons, and this rung is the floor — a false failure here
    // would fail every cell in the matrix for a reason unrelated to the agent.
    if (!check.ok && /SyntaxError/.test(check.output)) {
      problems.push(`${path}: ${check.output.split("\n").find((l) => l.includes("SyntaxError")) ?? "SyntaxError"}`);
    }
  }
  notes.push(`parsed ${sources.length} source file(s)`);

  if (baseline) {
    const before = await walk(baseline);
    const currentSet = new Set(current);

    for (const path of before) {
      if (!currentSet.has(path)) problems.push(`deleted: ${path}`);
    }

    for (const path of before) {
      if (!SOURCE_EXTENSIONS.has(extname(path)) || !currentSet.has(path)) continue;
      try {
        const [was, now] = await Promise.all([
          readFile(join(baseline, path), "utf8"),
          readFile(join(cwd, path), "utf8"),
        ]);
        const removed = [...exportsOf(was)].filter((name) => !exportsOf(now).has(name));
        if (removed.length > 0) {
          problems.push(`${path}: exports removed — ${removed.join(", ")}`);
        }
      } catch {
        // Unreadable is not a structural claim we can make. Skip it.
      }
    }
    notes.push(`compared ${before.length} baseline file(s)`);
  } else {
    notes.push("no baseline: deletion and export checks skipped");
  }

  return {
    ok: problems.length === 0,
    code: problems.length === 0 ? 0 : 1,
    output: [...notes, ...problems].join("\n"),
  };
}

async function execute(
  entry: DetectedRung,
  cwd: string,
  options: VerifyOptions,
): Promise<RungRun> {
  const started = Date.now();
  const exec = entry.execution;

  const result =
    exec.via === "command"
      ? await runCommand(exec.command, cwd, options.timeoutMs)
      : exec.via === "boot"
        ? await runBoot(exec.command, cwd, exec.holdMs)
        : await runDiffReview(cwd, options.baseline);

  return {
    rung: entry.rung,
    strength: entry.strength,
    command:
      exec.via === "diff-review"
        ? "(structural sanity, in-process)"
        : exec.command,
    ok: result.ok,
    code: result.code,
    wallMs: Date.now() - started,
    output: result.output,
  };
}

/**
 * Verify `cwd` at the strongest rung it supports.
 *
 * Returns `ok` plus the `Verification` that has to travel with it. A caller
 * that records `ok` and drops the rung has produced a number that cannot be
 * compared with any other number — which is worse than not measuring.
 */
export async function verifyRepo(
  cwd: string,
  options: VerifyOptions = {},
): Promise<VerifyOutcome> {
  const intake = options.intake ?? (await runIntake(cwd));
  const available = availableRungs(intake);

  // An explicit command wins. It still has to declare its rung — see the note
  // on `Fixture.verifyRung` for why guessing one is the expensive mistake.
  if (options.command) {
    const rung = options.rung;
    if (!rung) {
      throw new Error(
        "verifyRepo: `command` requires `rung`. A verification whose strength " +
          "is unknown cannot be compared with anything.",
      );
    }
    const run = await execute(
      { rung, strength: rungStrength(rung), execution: { via: "command", command: options.command }, why: "explicit" },
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

  const chosen = intake.detected.reduce<DetectedRung | null>(
    (best, entry) => (!best || entry.strength > best.strength ? entry : best),
    null,
  );

  if (!chosen) {
    // Cannot happen — diff-review is unconditional — but a caller that trusts
    // `ok` deserves an explicit no rather than a cheerful true.
    return {
      ok: false,
      verification: verificationOf(available, []),
      runs: [],
      intake,
    };
  }

  const run = await execute(chosen, cwd, options);
  options.onRung?.(run);

  return {
    ok: run.ok,
    verification: verificationOf(available, [chosen.rung]),
    runs: [run],
    intake,
  };
}

/** `tests (8)` — for logs and reports. */
export function describeVerification(verification: Verification): string {
  if (verification.used.length === 0) return "unverified (0)";
  return `${verification.used.join("+")} (${verification.strength})`;
}
