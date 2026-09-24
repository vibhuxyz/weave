import type { TaskStatus } from "@weave/protocol";
import type { ContractChangeRequest, ContractImpact } from "./types.ts";

export interface AssessContractChangeInput {
  request: ContractChangeRequest;
  requesterId: string;
  tasks: readonly { id: string; contractSymbols?: string[] }[];
  statuses: ReadonlyMap<string, TaskStatus>;
}

export function assessContractChange(input: AssessContractChangeInput): ContractImpact {
  const changedSymbols = new Set(input.request.affects);
  const affected = input.tasks.filter(
    (task) =>
      task.id === input.requesterId ||
      (task.contractSymbols ?? []).some((symbol) => changedSymbols.has(symbol)),
  );
  const statusOf = (id: string): TaskStatus => input.statuses.get(id) ?? "pending";
  return {
    notify: affected.filter((task) => statusOf(task.id) === "running").map((task) => task.id),
    rerun: affected.filter((task) => statusOf(task.id) === "ok").map((task) => task.id),
  };
}
