import { installedEngines } from "@weave/agent";
import { buildStats, engineCandidates, loadEmployeeRegistry, readHistory, resolveEmployee, weaveDirFor } from "@weave/core";
import { createLogger } from "../logging/index.ts";
import type { ModelRead } from "../project-model/index.ts";
import type { EstimateToolDeps } from "./estimate-tool.ts";

const log = createLogger("team-tools");

export function estimateDepsFor(projectDir: string, readModel: () => Promise<ModelRead>): EstimateToolDeps {
  return {
    readModel,
    readStats: async () => {
      const history = await readHistory(weaveDirFor(projectDir));
      for (const skipped of history.skipped) log.warn("Past run skipped in the team estimate", { path: skipped.path, reason: skipped.reason });
      return buildStats(history.runs);
    },
    loadRoles: async () => {
      const registry = await loadEmployeeRegistry({ projectRoot: projectDir });
      const configuredEngines = installedEngines().map((engine) => engine.id);
      return (task) => resolveEmployee(task, registry, { configuredEngines }).chosen?.employee.id ?? null;
    },
    engines: engineCandidates(undefined),
  };
}
