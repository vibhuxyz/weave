import type { CellResult, CellSummary, VerificationRung } from "@weave/protocol";
import { VERIFICATION_RUNGS } from "@weave/protocol";
import { summarize } from "./score.ts";

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

/**
 * The baseline table. **One section per verification rung.**
 *
 * This is the shape V1's exit criterion asks for, and the reason is the single
 * most important rule about the ladder: a repo whose test suite passes and a
 * scaffold whose process merely stayed up for five seconds are not comparable
 * results. Printing one pass rate across both produces a number that describes
 * nothing, and every decision made from it is taste wearing a percentage.
 *
 * So the rung is a heading, never a column. You cannot read this table and
 * accidentally average across it.
 */
export function renderMatrix(cells: CellResult[]): string {
  const summaries = summarize(cells);
  const lines: string[] = [];

  // Strongest first: the rung most people care about is at the top.
  const strengths = [...new Set(summaries.map((s) => s.strength))].sort(
    (a, b) => b - a,
  );

  for (const strength of strengths) {
    const section = summaries.filter((s) => s.strength === strength);
    lines.push(...renderSection(strength, section));
    lines.push("");
  }

  // Anything that is not pass/fail deserves to be shouted about: a matrix full
  // of `invalid-fixture` looks like a bad model until you read the statuses.
  const odd = cells.filter(
    (cell) => cell.status !== "pass" && cell.status !== "fail",
  );
  if (odd.length > 0) {
    lines.push("Not scored:");
    for (const cell of odd) {
      lines.push(
        `  ${cell.fixtureId} [${cell.configId}] #${cell.repeat}  ${cell.status}` +
          (cell.error ? ` — ${cell.error}` : ""),
      );
    }
    lines.push("");
  }

  const totalCost = summaries.reduce((sum, s) => sum + (s.totalCostUsd ?? 0), 0);
  const passed = cells.filter((c) => c.status === "pass").length;
  lines.push(
    `${passed}/${cells.length} cells passed` +
      (totalCost > 0 ? `   total cost: $${totalCost.toFixed(4)}` : ""),
  );

  return lines.join("\n");
}

function rungLabel(strength: number, rungs: VerificationRung[]): string {
  if (strength === 0) return "Rung 0 — unverified";
  const names = rungs.length > 0 ? rungs.join("+") : VERIFICATION_RUNGS[strength - 1];
  return `Rung ${strength} — ${names}`;
}

function renderSection(strength: number, summaries: CellSummary[]): string[] {
  const configs = [...new Set(summaries.map((s) => s.configId))];
  const fixtures = [...new Set(summaries.map((s) => s.fixtureId))];
  const rungs = [...new Set(summaries.flatMap((s) => s.rungs))];

  const cellWidth = Math.max(26, ...configs.map((config) => config.length + 2));
  const nameWidth = Math.max(12, ...fixtures.map((f) => f.length));

  const lines: string[] = [];
  lines.push(rungLabel(strength, rungs));
  lines.push(
    "fixture".padEnd(nameWidth) +
      "  " +
      configs.map((config) => config.padEnd(cellWidth)).join(""),
  );
  lines.push("-".repeat(nameWidth + 2 + cellWidth * configs.length));

  for (const fixture of fixtures) {
    const find = (config: string) =>
      summaries.find((s) => s.fixtureId === fixture && s.configId === config);

    // Two lines per row: the score, then the cost of getting it. Cramming both
    // onto one line pushes the table past a terminal width and it wraps into
    // something unreadable.
    const score = configs.map((config) => {
      const summary = find(config);
      if (!summary) return "-".padEnd(cellWidth);
      const spread =
        summary.minWallMs === summary.maxWallMs
          ? seconds(summary.medianWallMs)
          : `${seconds(summary.medianWallMs)} [${seconds(summary.minWallMs)}-${seconds(summary.maxWallMs)}]`;
      return `${summary.passed}/${summary.total} ${spread}`.padEnd(cellWidth);
    });

    const detail = configs.map((config) => {
      const summary = find(config);
      if (!summary) return "".padEnd(cellWidth);
      const cost =
        summary.totalCostUsd != null ? `$${summary.totalCostUsd.toFixed(4)}` : "$—";
      const other = Object.entries(summary.statuses)
        .filter(([status]) => status !== "pass")
        .map(([status, count]) => `${count} ${status}`)
        .join(" ");
      return `${cost}${other ? "  " + other : ""}`.padEnd(cellWidth);
    });

    lines.push(fixture.padEnd(nameWidth) + "  " + score.join(""));
    lines.push("".padEnd(nameWidth) + "  " + detail.join(""));
  }

  return lines;
}

/**
 * Per-cell detail, for the `--json` output and for anything downstream.
 *
 * Includes `filesChanged` and the context window, which the terminal table
 * leaves out for width. `contextUsed` is the closest thing to a token count
 * ACP gives us — the engines report a context-window figure, not input/output
 * token counts, and inventing the split would be a fiction.
 */
export function renderSummaryJson(cells: CellResult[]): {
  byRung: Array<{ strength: number; rungs: VerificationRung[]; summaries: CellSummary[] }>;
  cells: Array<CellResult & { rung: string }>;
} {
  const summaries = summarize(cells);
  const strengths = [...new Set(summaries.map((s) => s.strength))].sort(
    (a, b) => b - a,
  );

  return {
    byRung: strengths.map((strength) => {
      const section = summaries.filter((s) => s.strength === strength);
      return {
        strength,
        rungs: [...new Set(section.flatMap((s) => s.rungs))],
        summaries: section,
      };
    }),
    cells: cells.map((cell) => ({
      ...cell,
      rung: cell.verification.used.join("+") || "unverified",
    })),
  };
}

/** The ladder itself, with what a project supports marked. For `weave intake`. */
export function renderLadder(
  available: readonly VerificationRung[],
  missing: ReadonlyArray<{ rung: VerificationRung; why: string }>,
): string {
  const have = new Set(available);
  const why = new Map(missing.map((entry) => [entry.rung, entry.why]));

  return [...VERIFICATION_RUNGS]
    .map((rung, index) => index + 1)
    .reverse()
    .map((strength) => {
      const rung = VERIFICATION_RUNGS[strength - 1];
      const mark = have.has(rung) ? "✓" : "·";
      const note = have.has(rung) ? "" : `   ${why.get(rung) ?? "not detected"}`;
      return `  ${mark} ${strength}  ${rung.padEnd(12)}${note}`;
    })
    .join("\n");
}
