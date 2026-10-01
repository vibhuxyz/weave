import { estimateTeam, parseWorkItems, renderEstimate, type EngineCandidate, type GroupTask, type HistoryStats, type TeamEstimate } from "@weave/core";
import type { ModelRead } from "../project-model/index.ts";
import { TEAM_ESTIMATE_MAX_WORKERS } from "./constants.ts";
import type { ToolResult } from "./types.ts";

export interface EstimateToolDeps {
  readonly readModel: () => Promise<ModelRead>;
  readonly readStats: () => Promise<HistoryStats>;
  readonly loadRoles: () => Promise<(task: GroupTask) => string | null>;
  readonly engines: readonly EngineCandidate[];
}

export interface EstimateRun {
  readonly result: ToolResult;
  readonly estimate: TeamEstimate | null;
}

export async function runEstimateTool(args: unknown, deps: EstimateToolDeps): Promise<EstimateRun> {
  const parsed = parseWorkItems(args);
  if (!parsed.ok) return { result: { text: `Cannot estimate: ${parsed.issue}.`, isError: true }, estimate: null };
  const [model, stats, roleOf] = await Promise.all([deps.readModel(), deps.readStats(), deps.loadRoles()]);
  if (!model.ok) return { result: { text: `Cannot estimate: ${model.message}`, isError: true }, estimate: null };
  const estimate = estimateTeam({
    items: parsed.items,
    workspaces: [...model.model.applications, ...model.model.packages],
    imports: model.model.dependencies.internal,
    stats,
    engines: deps.engines,
    maxWorkers: TEAM_ESTIMATE_MAX_WORKERS,
    roleOf,
  });
  return { result: { text: renderEstimate(estimate), isError: false }, estimate };
}
