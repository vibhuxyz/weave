import { spawn } from "node:child_process";
import { cp, mkdtemp, rm, mkdir, copyFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, relative, sep } from "node:path";
import {
  Ledger,
  weaveDirFor,
  newRunId,
  runTask,
  readGitStatus,
  intake as runIntake,
  verifyRepo,
  availableRungs,
  strongestDetected,
  firstMatch,
  type Intake,
} from "@weave/core";
import type {
  CellResult,
  CellStatus,
  Fixture,
  RunConfig,
  TaskContract,
  Verification,
  VerificationRung,
} from "@weave/protocol";
import { configId, rungStrength, verificationOf, NO_VERIFICATION } from "@weave/protocol";

export interface EvalOptions {
  fixtures: Fixture[];
  configs: RunConfig[];
  /**
   * Runs per cell. Agent runs are nondeterministic — the same task can pass
   * and fail back to back. One run per cell measures nothing, and adding
   * repeats later invalidates every baseline already collected.
   */
  repeats?: number;
  /** Where the eval's own ledgers go. */
  weaveDir?: string;
  onCell?: (cell: CellResult) => void;
}

/** `git rev-parse HEAD` on a repo, or null when it is not one. */
function headOf(repo: string): Promise<string | null> {
  return new Promise((done) => {
    const child = spawn("git", ["rev-parse", "HEAD"], {
      cwd: repo,
      stdio: ["ignore", "pipe", "ignore"],
    });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => (out += chunk.toString()));
    child.on("error", () => done(null));
    child.on("close", (code) => done(code === 0 ? out.trim() : null));
  });
}

/**
 * Check the pin BEFORE the copy.
 *
 * It has to happen here and nowhere else: `copyRepo` deletes `.git`, so by the
 * time the cell has a working directory there is no HEAD left to compare. A
 * pin checked after the copy is a pin that is never checked — which is exactly
 * what this field was for its first two months.
 *
 * Accepts a prefix, so a fixture can pin `4f11ff5` rather than the full hash.
 */
async function checkCommit(
  repo: string,
  pinned: string | undefined,
): Promise<string | null> {
  if (!pinned) return null;
  const head = await headOf(repo);
  if (head === null) return `commit ${pinned} pinned, but ${repo} is not a git repo`;
  if (!head.startsWith(pinned)) {
    return `commit pin mismatch: fixture wants ${pinned}, repo HEAD is ${head.slice(0, 12)}`;
  }
  return null;
}

/**
 * Copy a repo to a fresh temp dir.
 *
 * `git checkout .` does not reset a run — the agent leaves untracked files —
 * and `git clean -fdx` takes node_modules with it. Copying is the cheapest
 * correct answer, and it means two configs never see each other's state.
 */
async function copyRepo(repo: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "weave-eval-"));
  const target = join(dir, "repo");

  // On APFS, `cp -c` uses clonefile: copy-on-write, so a 550MB monorepo costs
  // ~12s and almost no disk until something is modified. Node's fs.cp does a
  // real byte copy and is far slower.
  //
  // Tempting alternative — copy sources only and symlink node_modules — is
  // WRONG for workspace monorepos: bun/pnpm link each package into its
  // siblings' node_modules, and one root symlink does not reproduce that. It
  // was measured failing `check-types` on a pristine copy of a repo whose
  // original passes.
  if (process.platform === "darwin") {
    const cloned = await new Promise<boolean>((done) => {
      const child = spawn("cp", ["-c", "-R", repo, target], { stdio: "ignore" });
      child.on("error", () => done(false));
      child.on("close", (code) => done(code === 0));
    });
    if (cloned) {
      await rm(join(target, ".git"), { recursive: true, force: true });
      await rm(join(target, ".weave"), { recursive: true, force: true });
      return target;
    }
  }

  await cp(repo, target, {
    recursive: true,
    filter: (src) => !src.includes("/.git/") && !src.includes("/.weave/"),
  });
  return target;
}

/** An empty directory. The greenfield starting point: no repo, no code, no tests. */
async function emptyRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "weave-eval-"));
  const target = join(dir, "repo");
  await mkdir(target, { recursive: true });
  return target;
}

/**
 * Give the copy its own git history, with everything committed.
 *
 * Without this `filesChanged` is silently ALWAYS EMPTY in every eval cell:
 * `copyRepo` deletes `.git`, `readGitStatus` returns no branch, and the field
 * documented as "deterministic evidence, independent of which tool the agent
 * chose" quietly evidences nothing. Found by audit; see FINDINGS.
 *
 * Committing happens after injection so the harness's own test files are part
 * of the baseline and never show up as the agent's work.
 */
async function seedGit(cwd: string): Promise<void> {
  const run = (args: string[]) =>
    new Promise<void>((done) => {
      const child = spawn("git", args, { cwd, stdio: "ignore" });
      child.on("error", () => done());
      child.on("close", () => done());
    });

  await run(["init", "--quiet"]);
  await run(["config", "user.email", "eval@weave.local"]);
  await run(["config", "user.name", "weave eval"]);
  await run(["config", "commit.gpgsign", "false"]);
  await run(["add", "-A"]);
  await run(["commit", "--quiet", "--allow-empty", "-m", "fixture baseline"]);
}

/** Put harness-owned files in place — the acceptance criteria a greenfield repo cannot have. */
async function injectFiles(
  cwd: string,
  files: Record<string, string> | undefined,
): Promise<void> {
  for (const [relative, source] of Object.entries(files ?? {})) {
    const target = join(cwd, relative);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
  }
}

/**
 * Restore every `readOnlyPaths` file from the PRISTINE source repo, and delete
 * anything the agent added under those paths.
 *
 * This is the second half of the anti-cheat, and it does not need the files to
 * have been injected. A fixture verified by `npm run build` is scored by a
 * script that lives in the repo — so the agent can reach it, and editing it to
 * `exit 0` would pass every cell. The policy already rejects tool calls that
 * report those locations; this catches the ones that report nothing, which is
 * most shell commands.
 *
 * Deleting additions matters as much as restoring edits: a `build.mjs.bak`
 * left behind is harmless, but a new `build/index.mjs` that shadows the real
 * entry point is not.
 */
async function restoreReadOnly(
  cwd: string,
  baseline: string | undefined,
  patterns: string[] | undefined,
): Promise<string[]> {
  if (!baseline || !patterns?.length) return [];
  const restored: string[] = [];

  const pristine = await listFiles(baseline);
  for (const relative of pristine) {
    if (!firstMatch(patterns, relative)) continue;
    const target = join(cwd, relative);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(baseline, relative), target);
    restored.push(relative);
  }

  const pristineSet = new Set(pristine);
  for (const relative of await listFiles(cwd)) {
    if (!firstMatch(patterns, relative) || pristineSet.has(relative)) continue;
    await rm(join(cwd, relative), { force: true });
    restored.push(`-${relative}`);
  }

  return restored;
}

const SKIP_DIRS = new Set(["node_modules", ".git", ".weave", "dist", "coverage"]);

/** Every file under `dir`, as POSIX paths relative to it. */
async function listFiles(dir: string, root = dir, out: string[] = []): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await listFiles(full, root, out);
    } else if (entry.isFile()) {
      out.push(relative(root, full).split(sep).join("/"));
    }
  }
  return out;
}

/**
 * Run one cell: fixture × config × repeat.
 *
 * The ORDER is the point. Verification runs against restored, pristine test
 * files, so a task scored on "does the suite pass" cannot be passed by editing
 * the suite. Policing that with permissions alone is not enough — Claude Code's
 * own Edit tool never crosses our wire — which is why `readOnlyPaths` is now
 * both a policy rule AND a restore, and neither is trusted alone.
 */
export async function runCell(
  fixture: Fixture,
  config: RunConfig,
  repeat: number,
  weaveDir: string,
): Promise<CellResult> {
  const label = configId(config);
  const kind = fixture.kind ?? "existing";
  const base = {
    fixtureId: fixture.id,
    configId: label,
    repeat,
    turns: 0,
    filesChanged: [] as string[],
  };
  const fail = (
    status: CellStatus,
    error: string,
    wallMs = 0,
    verification: Verification = NO_VERIFICATION,
  ): CellResult => ({ ...base, status, wallMs, error, verification });

  let root: string | null = null;
  const started = Date.now();

  try {
    if (kind === "existing" && !fixture.repo) {
      return fail("invalid-fixture", "kind is `existing` but no repo is set");
    }

    // Pin check first: it needs the source repo's `.git`, which the copy loses.
    if (fixture.repo) {
      const mismatch = await checkCommit(fixture.repo, fixture.commit);
      if (mismatch) return fail("invalid-fixture", mismatch);
    }

    const cwd = kind === "greenfield" ? await emptyRepo() : await copyRepo(fixture.repo!);
    root = resolve(cwd, "..");
    await injectFiles(cwd, fixture.injectFiles);
    await seedGit(cwd);

    // The pristine source repo doubles as diff-review's baseline. It is never
    // written to, so no second copy is needed.
    const baseline = kind === "greenfield" ? undefined : fixture.repo;

    const verifyOptions = {
      command: fixture.verify,
      rung: fixture.verifyRung,
      baseline,
    };

    const before = await runIntake(cwd);

    // ── Precondition ────────────────────────────────────────────────────
    // A fixture that already satisfies its own goal measures nothing and
    // quietly inflates the pass rate, so refuse to score it rather than
    // reporting a free win.
    if (fixture.expectRungAtLeast) {
      // Greenfield: the goal is "produce something that reaches this rung".
      // The precondition is that the starting point does NOT already reach it.
      const start = strongestDetected(before);
      const wanted = rungStrength(fixture.expectRungAtLeast);
      if (start && start.strength >= wanted) {
        return fail(
          "invalid-fixture",
          `starts at ${start.rung} (${start.strength}), already >= required ${fixture.expectRungAtLeast} (${wanted})`,
        );
      }
    } else {
      const pre = await verifyRepo(cwd, { ...verifyOptions, intake: before });
      if (fixture.expectFail && pre.ok) {
        return fail(
          "invalid-fixture",
          `verify PASSED before the run at ${pre.verification.used.join("+") || "no rung"}, but expectFail is true`,
          0,
          pre.verification,
        );
      }
      if (!fixture.expectFail && !pre.ok) {
        return fail(
          "invalid-fixture",
          `verify FAILED before the run at ${pre.verification.used.join("+") || "no rung"}, but expectFail is false`,
          0,
          pre.verification,
        );
      }
    }

    const task: TaskContract = {
      id: `${fixture.id}#${repeat}`,
      prompt: fixture.prompt,
      cwd,
      verify: fixture.verify,
      verifyRung: fixture.verifyRung,
      // Now actually enforced by the policy, not just restored afterwards.
      readOnlyPaths: fixture.readOnlyPaths,
    };

    const ledger = new Ledger(weaveDir, newRunId());
    ledger.append("intake.detected", {
      taskId: task.id,
      cwd,
      isGitRepo: before.isGitRepo,
      head: before.head,
      available: availableRungs(before),
      missing: before.missing,
    });

    const outcome = await runTask({
      task,
      ledger,
      config: {
        ...config,
        maxTurns: fixture.maxTurns ?? config.maxTurns,
        timeoutMs: fixture.timeoutMs ?? config.timeoutMs,
      },
    });

    // Restore anything the agent must not have influenced, THEN verify. Order
    // is the whole anti-cheat story: verification runs against pristine
    // acceptance criteria, so editing them cannot move the score.
    await injectFiles(cwd, fixture.injectFiles);
    const restored = await restoreReadOnly(cwd, baseline, fixture.readOnlyPaths);
    if (restored.length > 0) {
      ledger.append("error", {
        taskId: task.id,
        where: "restoreReadOnly",
        message: `restored ${restored.length} read-only path(s): ${restored.join(", ")}`,
      });
    }

    const filesChanged = (await readGitStatus(cwd)).changes.map((c) => c.path);

    // ── Verify ──────────────────────────────────────────────────────────
    let verification: Verification;
    let verified: boolean;
    let ladderNote: string | undefined;

    const after = await runIntake(cwd);

    if (fixture.expectRungAtLeast) {
      // Greenfield acceptance: did the agent produce something that reaches
      // the required rung at all? Scoring a scaffold at diff-review because it
      // never became buildable would report a pass for an empty directory.
      const reached = strongestDetected(after);
      const wanted = rungStrength(fixture.expectRungAtLeast);
      if (!reached || reached.strength < wanted) {
        verification = verificationOf(availableRungs(after), []);
        verified = false;
        ladderNote =
          `never reached ${fixture.expectRungAtLeast} (${wanted}); ` +
          `strongest available is ${reached?.rung ?? "none"} (${reached?.strength ?? 0})`;
      } else {
        const result = await runVerification(cwd, { ...verifyOptions, intake: after }, ledger, task.id);
        verification = result.verification;
        verified = result.ok;
      }
    } else {
      const result = await runVerification(cwd, { ...verifyOptions, intake: after }, ledger, task.id);
      verification = result.verification;
      verified = result.ok;
    }

    const wallMs = Date.now() - started;

    // `cancelled` means a cap tripped. Kept distinct from a genuine fail: a
    // looping agent and a wrong answer are different problems.
    const status: CellStatus =
      outcome.result.status === "cancelled"
        ? "timeout"
        : outcome.result.status === "failed"
          ? "error"
          : verified
            ? "pass"
            : "fail";

    ledger.append("cell.finished", {
      fixtureId: fixture.id,
      configId: label,
      repeat,
      status,
      wallMs,
      turns: outcome.turns,
      filesChanged,
      costUsd: outcome.costUsd,
      strength: verification.strength,
      used: verification.used,
    });

    return {
      ...base,
      status,
      verification,
      wallMs,
      turns: outcome.turns,
      filesChanged,
      costUsd: outcome.costUsd,
      contextUsed: outcome.contextUsed,
      contextSize: outcome.contextSize,
      runId: outcome.runId,
      error: outcome.result.error ?? ladderNote,
    };
  } catch (error) {
    return fail(
      "error",
      error instanceof Error ? error.message : String(error),
      Date.now() - started,
    );
  } finally {
    // The copy is disposable by design; keeping it would fill the disk.
    if (root) await rm(root, { recursive: true, force: true });
  }
}

/** Run the ladder and record every rung to the ledger as it goes. */
async function runVerification(
  cwd: string,
  options: {
    command?: string;
    rung?: VerificationRung;
    baseline?: string;
    intake: Intake;
  },
  ledger: Ledger,
  taskId: string,
): Promise<{ ok: boolean; verification: Verification }> {
  const outcome = await verifyRepo(cwd, {
    ...options,
    onRung: (run) =>
      ledger.append("verification.rung", {
        taskId,
        rung: run.rung,
        strength: run.strength,
        command: run.command,
        ok: run.ok,
        wallMs: run.wallMs,
        output: run.output.slice(-2000),
      }),
  });

  ledger.append("verification.finished", {
    taskId,
    ok: outcome.ok,
    available: outcome.verification.available,
    used: outcome.verification.used,
    strength: outcome.verification.strength,
  });

  return { ok: outcome.ok, verification: outcome.verification };
}

/**
 * Run the full matrix, **sequentially**.
 *
 * Wall clock is one of the metrics. Parallel cells contend for CPU and API
 * rate limits and the timings stop being comparable. Parallelism is the thing
 * being measured, not the thing to measure with.
 */
export async function runMatrix(options: EvalOptions): Promise<CellResult[]> {
  const repeats = options.repeats ?? 3;
  const weaveDir = options.weaveDir ?? weaveDirFor(join(tmpdir(), "weave-eval"));
  const cells: CellResult[] = [];

  for (const config of options.configs) {
    for (const fixture of options.fixtures) {
      for (let repeat = 1; repeat <= repeats; repeat += 1) {
        const cell = await runCell(fixture, config, repeat, weaveDir);
        cells.push(cell);
        options.onCell?.(cell);
      }
    }
  }

  return cells;
}
