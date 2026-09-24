import { analyzeImpact, type ProjectAnswer, type ProjectModel } from "@weave/core";
import type { ProjectModelView, ProjectQueryView } from "../shared/index.ts";
import { MAX_LISTED_APIS, MAX_LISTED_FILES, MAX_LISTED_NAMES } from "./constants.ts";

function apiLabel(api: { readonly method: string; readonly path: string }): string {
  return `${api.method.toUpperCase()} ${api.path}`;
}

export function toQueryView(model: ProjectModel, answer: ProjectAnswer): ProjectQueryView {
  const files = answer.files.slice(0, MAX_LISTED_FILES);
  const impact = analyzeImpact(model, { files: files.map((file) => file.path), symbols: [] });
  return {
    request: answer.request,
    application: answer.application ? `${answer.application.name} (${answer.application.dir})` : null,
    files: files.map((file) => ({ path: file.path, reasons: file.reasons.slice(0, 3) })),
    symbols: answer.symbols.slice(0, MAX_LISTED_NAMES).map((entry) => entry.symbol.name),
    apis: answer.apis.slice(0, MAX_LISTED_NAMES).map(apiLabel),
    dependents: answer.dependencies.dependents.slice(0, MAX_LISTED_NAMES),
    callers: answer.dependencies.callers.slice(0, MAX_LISTED_NAMES),
    tests: answer.verification.tests.slice(0, MAX_LISTED_NAMES),
    commands: answer.verification.commands.slice(0, MAX_LISTED_NAMES).map((step) => `${step.command} (in ${step.cwd || "."})`),
    recentChanges: answer.recentChanges.slice(0, MAX_LISTED_NAMES).map((commit) => `${commit.sha.slice(0, 8)} ${commit.subject}`),
    impactedWorkspaces: impact.workspaces.slice(0, MAX_LISTED_NAMES),
  };
}

export function toModelView(model: ProjectModel, buildMs: number, query: ProjectQueryView | null): ProjectModelView {
  const layersByWorkspace = new Map(model.architecture.map((entry) => [entry.workspace, entry.layers]));
  const workspaces = [
    ...model.applications.map((workspace) => ({ workspace, kind: "application" as const })),
    ...model.packages.map((workspace) => ({ workspace, kind: "package" as const })),
  ].slice(0, MAX_LISTED_NAMES);
  return {
    revision: model.revision,
    branch: model.repository.branch,
    counts: { files: model.files.length, symbols: model.symbols.length, apis: model.apis.length, events: model.events.length, imports: model.dependencies.internal.length },
    stack: model.stack,
    workspaces: workspaces.map(({ workspace, kind }) => ({ name: workspace.name, dir: workspace.dir, kind, layers: { ...(layersByWorkspace.get(workspace.name) ?? {}) } })),
    apis: model.apis.slice(0, MAX_LISTED_APIS).map(apiLabel),
    buildMs: Math.round(buildMs),
    query,
  };
}
