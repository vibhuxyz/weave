import type { InspectHarvest } from "../../pool/index.ts";
import type { Ledger } from "../../shared/index.ts";
import type { Employee } from "../model/index.ts";
import { verifyEmployeeWork } from "./verify-work.ts";

export interface InspectorInput {
  readonly employeesByTask: ReadonlyMap<string, Employee>;
  readonly ledger: Ledger;
  readonly next?: InspectHarvest;
}

export function employeeInspector(input: InspectorInput): InspectHarvest {
  return async (task, worktreePath, files) => {
    const earlier = input.next ? await input.next(task, worktreePath, files) : null;
    if (earlier) return earlier;
    const employee = input.employeesByTask.get(task.id);
    const policy = employee?.verification;
    if (!employee || !policy || policy.required.length + policy.preferred.length === 0) return null;
    const verified = await verifyEmployeeWork(worktreePath, policy);
    input.ledger.append("employee.verified", {
      taskId: task.id,
      employeeId: employee.id,
      ok: verified.ok,
      rungs: verified.checks.map(({ rung, ok, wallMs }) => ({ rung, ok, wallMs })),
      detail: verified.detail,
    });
    return verified.ok ? null : `${employee.name} verification policy failed: ${verified.detail}`;
  };
}
