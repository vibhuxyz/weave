import type { ProjectModel } from "@weave/core";
import type { ChangeView, ProjectOverview, WorkspaceView } from "../shared/index.ts";
import { capped, flat } from "./capped.ts";
import { MAX_RECENT_CHANGES_SHOWN, MAX_SKIPPED_SHOWN, MAX_WORKSPACES_SHOWN } from "./constants.ts";

const SHORT_SHA_LENGTH = 8;

type CommitSummary = ProjectModel["recentChanges"][number];

export function changeView(change: CommitSummary): ChangeView {
  return { sha: change.sha.slice(0, SHORT_SHA_LENGTH), at: change.at, subject: flat(change.subject), fileCount: change.files.length };
}

function workspaceViews(model: ProjectModel): readonly WorkspaceView[] {
  const layersOf = new Map(model.architecture.map((entry) => [entry.workspace, entry.layers]));
  return [...model.applications, ...model.packages].map((workspace) => ({
    name: workspace.name,
    dir: workspace.dir,
    kind: workspace.kind,
    internalDependencies: workspace.internalDependencies,
    layers: Object.entries(layersOf.get(workspace.name) ?? {})
      .flatMap(([layer, files]) => (files ? [{ layer, files }] : []))
      .sort((a, b) => b.files - a.files || a.layer.localeCompare(b.layer)),
  }));
}

export function projectOverview(model: ProjectModel): ProjectOverview {
  const { repository, stack, dependencies } = model;
  return {
    revision: model.revision,
    repository: { isGitRepo: repository.isGitRepo, branch: repository.branch, head: repository.head?.slice(0, SHORT_SHA_LENGTH) ?? null },
    stack: { languages: stack.languages, frameworks: stack.frameworks, packageManager: stack.packageManager },
    counts: {
      files: model.files.length,
      symbols: model.symbols.length,
      imports: dependencies.internal.length,
      calls: dependencies.calls.length,
      apis: model.apis.length,
      events: model.events.length,
      externalPackages: dependencies.external.length,
    },
    workspaces: capped(workspaceViews(model), MAX_WORKSPACES_SHOWN),
    recentChanges: capped(model.recentChanges.map(changeView), MAX_RECENT_CHANGES_SHOWN),
    skipped: capped(model.skipped.map((entry) => ({ path: entry.path, reason: flat(entry.reason) })), MAX_SKIPPED_SHOWN),
  };
}
