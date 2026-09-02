import type { CellResult, CellSummary } from "@berd/protocol";
import { summarize } from "./score.ts";

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

/**
 * One row per fixture, one column per config.
 *
 * Shows passed/total AND the wall-clock spread, because a 3/3 ranging
 * 20s-400s is a different result from a 3/3 that is always 30s — and a mean
 * would hide exactly that.
 */
export function renderMatrix(cells: CellResult[]): string {
  const summaries = summarize(cells);
  const configs = [...new Set(summaries.map((s) => s.configId))];
  const fixtures = [...new Set(summaries.map((s) => s.fixtureId))];

  const cellWidth = Math.max(20, ...configs.map((config) => config.length + 2));
  const nameWidth = Math.max(10, ...fixtures.map((f) => f.length));

  const lines: string[] = [];
  lines.push(
    "fixture".padEnd(nameWidth) +
      "  " +
      configs.map((config) => config.padEnd(cellWidth)).join(""),
  );
  lines.push("-".repeat(nameWidth + 2 + cellWidth * configs.length));

  for (const fixture of fixtures) {
    const cols = configs.map((config) => {
      const summary = summaries.find(
        (s) => s.fixtureId === fixture && s.configId === config,
      );
      if (!summary) return "-".padEnd(cellWidth);
      const spread =
        summary.minWallMs === summary.maxWallMs
          ? seconds(summary.medianWallMs)
          : `${seconds(summary.medianWallMs)} [${seconds(summary.minWallMs)}-${seconds(summary.maxWallMs)}]`;
      return `${summary.passed}/${summary.total} ${spread}`.padEnd(cellWidth);
    });
    lines.push(fixture.padEnd(nameWidth) + "  " + cols.join(""));
  }

  // Anything that is not pass/fail deserves to be shouted about: a matrix full
  // of `invalid-fixture` looks like a bad model until you read the statuses.
  const odd = cells.filter(
    (cell) => cell.status !== "pass" && cell.status !== "fail",
  );
  if (odd.length > 0) {
    lines.push("");
    lines.push("Not scored:");
    for (const cell of odd) {
      lines.push(
        `  ${cell.fixtureId} [${cell.configId}] #${cell.repeat}  ${cell.status}` +
          (cell.error ? ` - ${cell.error}` : ""),
      );
    }
  }

  const totalCost = summaries.reduce((sum, s) => sum + (s.totalCostUsd ?? 0), 0);
  if (totalCost > 0) {
    lines.push("");
    lines.push(`total cost: $${totalCost.toFixed(4)}`);
  }

  return lines.join("\n");
}

export function renderSummaryJson(cells: CellResult[]): CellSummary[] {
  return summarize(cells);
}
