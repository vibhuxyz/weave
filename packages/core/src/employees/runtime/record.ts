import type { PoolReport } from "../../pool/index.ts";
import type { Ledger } from "../../shared/index.ts";
import { appendMemory, memoriesFrom, type MemoryEntry } from "../memory/index.ts";
import type { Employee } from "../model/index.ts";

export interface RecordMemoriesInput {
  readonly report: PoolReport;
  readonly titles: ReadonlyMap<string, string>;
  readonly employeesByTask: ReadonlyMap<string, Employee>;
  readonly weaveDir: string;
  readonly ledger: Ledger;
  readonly now: Date;
}

export async function recordEmployeeMemories(input: RecordMemoriesInput): Promise<void> {
  const grouped = new Map<string, { employee: Employee; entries: MemoryEntry[] }>();
  for (const entry of input.report.tasks) {
    const employee = input.employeesByTask.get(entry.taskId);
    if (!employee?.memory.enabled || entry.status === "skipped") continue;
    const learned = memoriesFrom({
      runId: input.ledger.runId, taskId: entry.taskId, title: input.titles.get(entry.taskId) ?? entry.taskId,
      status: entry.status, reason: entry.reason, finalMessage: entry.finalMessage, at: input.now.toISOString(),
    });
    const group = grouped.get(employee.id) ?? { employee, entries: [] };
    group.entries.push(...learned);
    grouped.set(employee.id, group);
    input.ledger.append("employee.memory.recorded", { taskId: entry.taskId, employeeId: employee.id, entries: learned.length });
  }
  await Promise.all([...grouped.values()].map(({ employee, entries }) => appendMemory(input.weaveDir, employee.id, entries, employee.memory.maxEntries)));
}
