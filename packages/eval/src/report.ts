import type { EvalCell } from "./harness.ts";

/** A plain-text matrix: one row per task, one column per config. */
export function renderMatrix(cells: EvalCell[]): string {
  const configs = [...new Set(cells.map((cell) => cell.configLabel))];
  const tasks = [...new Set(cells.map((cell) => cell.taskId))];
  const width = Math.max(8, ...tasks.map((task) => task.length));

  const header = ["task".padEnd(width), ...configs].join("  ");
  const rows = tasks.map((task) => {
    const cols = configs.map((config) => {
      const cell = cells.find(
        (entry) => entry.taskId === task && entry.configLabel === config,
      );
      if (!cell) return "-".padEnd(config.length);
      const mark = cell.result.status === "ok" ? "ok" : "FAIL";
      return `${mark} ${cell.result.wallMs}ms`.padEnd(config.length);
    });
    return [task.padEnd(width), ...cols].join("  ");
  });

  return [header, ...rows].join("\n");
}
