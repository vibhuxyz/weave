import type { TaskContract, TaskPolicy } from "@weave/protocol";
import type { Employee } from "../model/index.ts";
import { isUnrestricted } from "../resolver/index.ts";

export function policyOf(employee: Employee): TaskPolicy {
  const { filesystem, git, deployment, network } = employee.permissions;
  return {
    ...(isUnrestricted(filesystem.write) ? {} : { filesystem: { write: [...filesystem.write] } }),
    git: { commit: git.commit },
    deployment: { allowed: deployment.allowed },
    network: { allowed: network.allowed },
  };
}

export function compileTask<T extends TaskContract>(task: T, employee: Employee): T {
  const write = employee.permissions.filesystem.write;
  const allowedPaths = task.allowedPaths ?? (isUnrestricted(write) ? undefined : [...write]);
  const capabilities = [...new Set([...(task.capabilities ?? []), ...employee.capabilities])].sort();
  return {
    ...task,
    employee: employee.id,
    policy: policyOf(employee),
    ...(allowedPaths ? { allowedPaths } : {}),
    ...(capabilities.length > 0 ? { capabilities } : {}),
  };
}

export function engineOrderFor(employee: Employee, order: readonly string[]): readonly string[] {
  const allowed = employee.engines.allowed;
  const permitted = allowed === null ? order : order.filter((engineId) => allowed.includes(engineId));
  const preferred = employee.engines.preferred.filter((engineId) => permitted.includes(engineId));
  return [...preferred, ...permitted.filter((engineId) => !preferred.includes(engineId))];
}
