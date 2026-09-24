import type { RunHistory } from "../../adaptive/index.ts";
import { medianOf } from "../../shared/index.ts";
import type { EmployeePerformance } from "../resolver/index.ts";

export function employeePerformance(runs: readonly RunHistory[]): ReadonlyMap<string, EmployeePerformance> {
  const byEmployee = new Map<string, { ok: number; walls: number[] }>();
  for (const record of runs.flatMap((run) => run.employeeTasks)) {
    const entry = byEmployee.get(record.employeeId) ?? { ok: 0, walls: [] };
    entry.walls.push(record.wallMs);
    if (record.status === "ok") entry.ok += 1;
    byEmployee.set(record.employeeId, entry);
  }
  return new Map([...byEmployee.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([employeeId, entry]) => [
    employeeId,
    { tasks: entry.walls.length, ok: entry.ok, medianWallMs: medianOf(entry.walls) },
  ]));
}
