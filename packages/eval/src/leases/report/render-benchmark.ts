import type { BenchmarkRow, SimulationConfig } from "../types.ts";
import { percent, seconds } from "./render.ts";

const HEADERS = ["scenario", "verified", "finish", "tasks/s", "recover p50", "recover p95", "takeovers", "blocked", "busy", "wasted", "broken", "real ms"] as const;

function cellsOf(row: BenchmarkRow): readonly string[] {
  return [
    row.label,
    percent(row.verifiedShare),
    seconds(row.makespanMs),
    row.throughputPerSecond.toFixed(2),
    row.recoveryP50Ms === null ? "-" : seconds(row.recoveryP50Ms),
    row.recoveryP95Ms === null ? "-" : seconds(row.recoveryP95Ms),
    String(row.takeovers),
    String(row.fenced),
    percent(row.busyShare),
    percent(row.wastedShare),
    String(row.violations),
    row.wallMs.toFixed(1),
  ];
}

export function renderBenchmark(rows: readonly BenchmarkRow[], base: SimulationConfig): string {
  const table = [HEADERS, ...rows.map(cellsOf)];
  const widths = HEADERS.map((_, column) => Math.max(...table.map((cells) => cells[column]?.length ?? 0)));
  const lines = table.map((cells) => cells.map((cell, column) => (column === 0 ? cell.padEnd(widths[column] ?? 0) : cell.padStart(widths[column] ?? 0))).join("  "));
  const runs = rows[0]?.runs ?? 0;
  return [
    `Lease benchmark · ${base.tasks} tasks · medians of ${runs} seeded run(s) per row · times are simulated except "real ms"`,
    "",
    ...lines,
    "",
    "finish = time until every task was verified or failed · recover = worker lost → another worker owns the task",
    "blocked = late writes from workers whose lease had ended · broken = invariant violations across all runs (must be 0)",
  ].join("\n");
}
