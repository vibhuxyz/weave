import { analyzeImpact, queryProject, type ProjectModel } from "@weave/core";
import type { ApiView, ProjectQueryResult } from "../shared/index.ts";
import { capped, flat } from "./capped.ts";
import { MAX_IMPACT_SEED_FILES } from "./constants.ts";
import { changeView } from "./overview.ts";

type Api = ProjectModel["apis"][number];

function apiView(api: Api): ApiView {
  return { method: api.method, path: api.path, file: api.file, line: api.line };
}

export function queryView(model: ProjectModel, request: string): ProjectQueryResult {
  const answer = queryProject(model, request);
  const seedFiles = answer.files.slice(0, MAX_IMPACT_SEED_FILES).map((file) => file.path);
  const impact = analyzeImpact(model, { files: seedFiles });
  return {
    request: answer.request,
    terms: answer.terms,
    application: answer.application,
    files: capped(answer.files.map((file) => ({ path: file.path, workspace: file.workspace, reasons: file.reasons.map(flat) }))),
    symbols: capped(answer.symbols.map(({ symbol }) => ({ name: symbol.name, kind: symbol.kind, file: symbol.file, line: symbol.line }))),
    imports: capped(answer.dependencies.imports),
    dependents: capped(answer.dependencies.dependents),
    callers: capped(answer.dependencies.callers),
    callees: capped(answer.dependencies.callees),
    apis: capped(answer.apis.map(apiView)),
    events: capped(answer.events.map((event) => ({ name: flat(event.name), role: event.role, file: event.file, line: event.line }))),
    recentChanges: capped(answer.recentChanges.map(changeView)),
    tests: capped(answer.verification.tests),
    commands: capped(answer.verification.commands.map((step) => ({ command: flat(step.command), cwd: step.cwd }))),
    impact: {
      seedFiles,
      dependents: capped(impact.dependents),
      callers: capped(impact.callers),
      apis: capped(impact.apis.map(apiView)),
      tests: capped(impact.tests),
      workspaces: impact.workspaces,
      isTruncated: impact.isTruncated,
    },
  };
}
