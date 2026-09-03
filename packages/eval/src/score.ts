import { spawn } from "node:child_process";
import type { CellResult, CellSummary, VerificationRung } from "@weave/protocol";

export interface VerifyResult {
  ok: boolean;
  code: number | null;
  /** Tail of combined output, for chasing a surprising fail. */
  output: string;
}

/**
 * Run a fixture's verify command in `cwd`.
 *
 * Output is captured, not inherited: an unattended matrix run would otherwise
 * bury its own progress under every suite's stdout.
 */
export function runVerify(
  command: string,
  cwd: string,
  timeoutMs = 5 * 60 * 1000,
): Promise<VerifyResult> {
  return new Promise((done) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    const collect = (chunk: Buffer) => {
      output += chunk.toString();
      // Keep only the tail; a failing suite can emit megabytes.
      if (output.length > 8000) output = output.slice(-8000);
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

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

/**
 * Collapse repeats into one summary per fixture x config **x verification
 * strength**.
 *
 * Median rather than mean: one 10-minute timeout would drag a mean far enough
 * to make a config look worse than it is. min-max is reported alongside so the
 * spread stays visible instead of being hidden by the middle.
 *
 * Strength is part of the grouping key, not a column. That is the whole point:
 * a repeat scored at `tests` (8) and a repeat of the same cell scored at
 * `build` (4) — which happens when a scaffold run only half-worked — are not
 * the same measurement, and one pass rate across both describes nothing. When
 * every repeat lands on the same rung, which is the normal case, this groups
 * exactly as it did before.
 */
export function summarize(cells: CellResult[]): CellSummary[] {
  const groups = new Map<string, CellResult[]>();
  for (const cell of cells) {
    const key = `${cell.fixtureId} ${cell.configId} ${cell.verification.strength}`;
    groups.set(key, [...(groups.get(key) ?? []), cell]);
  }

  return [...groups.values()].map((group) => {
    const wall = group.map((cell) => cell.wallMs);
    const statuses: Record<string, number> = {};
    let cost = 0;
    let sawCost = false;
    for (const cell of group) {
      statuses[cell.status] = (statuses[cell.status] ?? 0) + 1;
      if (cell.costUsd != null) {
        cost += cell.costUsd;
        sawCost = true;
      }
    }

    const rungs = [
      ...new Set(group.flatMap((cell) => cell.verification.used)),
    ] as VerificationRung[];

    return {
      fixtureId: group[0].fixtureId,
      configId: group[0].configId,
      strength: group[0].verification.strength,
      rungs,
      passed: group.filter((cell) => cell.status === "pass").length,
      total: group.length,
      medianWallMs: median(wall),
      minWallMs: Math.min(...wall),
      maxWallMs: Math.max(...wall),
      statuses,
      totalCostUsd: sawCost ? cost : undefined,
    };
  });
}
