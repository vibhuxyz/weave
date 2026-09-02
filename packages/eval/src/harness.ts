import { spawn } from "node:child_process";
import { cp, mkdtemp, rm, mkdir, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Ledger, berdDirFor, newRunId, runTask, readGitStatus } from "@berd/core";
import type {
  CellResult,
  CellStatus,
  Fixture,
  RunConfig,
  TaskContract,
} from "@berd/protocol";
import { configId } from "@berd/protocol";
import { runVerify } from "./score.ts";

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
  berdDir?: string;
  onCell?: (cell: CellResult) => void;
}

/**
 * Copy a repo to a fresh temp dir.
 *
 * `git checkout .` does not reset a run — the agent leaves untracked files —
 * and `git clean -fdx` takes node_modules with it. Copying is the cheapest
 * correct answer, and it means two configs never see each other's state.
 */
async function copyRepo(repo: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "berd-eval-"));
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
      await rm(join(target, ".berd"), { recursive: true, force: true });
      return target;
    }
  }

  await cp(repo, target, {
    recursive: true,
    filter: (src) => !src.includes("/.git/") && !src.includes("/.berd/"),
  });
  return target;
}

/** Put harness-owned files in place — e.g. a test suite the repo lacks. */
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
 * Run one cell: fixture × config × repeat.
 *
 * The ORDER is the point. Verification runs against restored, pristine test
 * files, so a task scored on "does the suite pass" cannot be passed by editing
 * the suite. Policing that with permissions alone is not enough — Claude Code's
 * own Edit tool never crosses our wire.
 */
export async function runCell(
  fixture: Fixture,
  config: RunConfig,
  repeat: number,
  berdDir: string,
): Promise<CellResult> {
  const label = configId(config);
  const base = {
    fixtureId: fixture.id,
    configId: label,
    repeat,
    turns: 0,
    filesChanged: [] as string[],
  };
  const fail = (status: CellStatus, error: string, wallMs = 0): CellResult => ({
    ...base,
    status,
    wallMs,
    error,
  });

  let root: string | null = null;
  const started = Date.now();

  try {
    const cwd = await copyRepo(fixture.repo);
    root = resolve(cwd, "..");
    await injectFiles(cwd, fixture.injectFiles);

    // Precondition. A fixture whose verify already passes measures nothing and
    // quietly inflates the pass rate, so refuse to score it rather than
    // reporting a free win.
    const before = await runVerify(fixture.verify, cwd);
    if (fixture.expectFail && before.ok) {
      return fail(
        "invalid-fixture",
        `verify PASSED before the run, but expectFail is true`,
      );
    }
    if (!fixture.expectFail && !before.ok) {
      return fail(
        "invalid-fixture",
        `verify FAILED before the run, but expectFail is false`,
      );
    }

    const task: TaskContract = {
      id: `${fixture.id}#${repeat}`,
      prompt: fixture.prompt,
      cwd,
      verify: fixture.verify,
    };

    const ledger = new Ledger(berdDir, newRunId());
    const outcome = await runTask({
      task,
      ledger,
      config: {
        ...config,
        maxTurns: fixture.maxTurns ?? config.maxTurns,
        timeoutMs: fixture.timeoutMs ?? config.timeoutMs,
      },
    });

    // Restore anything the agent must not have influenced, then verify.
    await injectFiles(cwd, fixture.injectFiles);

    const after = await runVerify(fixture.verify, cwd);
    const filesChanged = (await readGitStatus(cwd)).changes.map((c) => c.path);
    const wallMs = Date.now() - started;

    // `cancelled` means a cap tripped. Kept distinct from a genuine fail: a
    // looping agent and a wrong answer are different problems.
    const status: CellStatus =
      outcome.result.status === "cancelled"
        ? "timeout"
        : outcome.result.status === "failed"
          ? "error"
          : after.ok
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
    });

    return {
      ...base,
      status,
      wallMs,
      turns: outcome.turns,
      filesChanged,
      costUsd: outcome.costUsd,
      contextUsed: outcome.contextUsed,
      contextSize: outcome.contextSize,
      runId: outcome.runId,
      error: outcome.result.error,
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

/**
 * Run the full matrix, **sequentially**.
 *
 * Wall clock is one of the metrics. Parallel cells contend for CPU and API
 * rate limits and the timings stop being comparable. Parallelism is the thing
 * being measured, not the thing to measure with.
 */
export async function runMatrix(options: EvalOptions): Promise<CellResult[]> {
  const repeats = options.repeats ?? 3;
  const berdDir = options.berdDir ?? berdDirFor(join(tmpdir(), "berd-eval"));
  const cells: CellResult[] = [];

  for (const config of options.configs) {
    for (const fixture of options.fixtures) {
      for (let repeat = 1; repeat <= repeats; repeat += 1) {
        const cell = await runCell(fixture, config, repeat, berdDir);
        cells.push(cell);
        options.onCell?.(cell);
      }
    }
  }

  return cells;
}
