import type { ProjectOverview } from "../types";
import { Mono, ResultList } from "./ResultList";

type WorkspaceView = ProjectOverview["workspaces"]["items"][number];

function WorkspaceRow({ workspace }: { readonly workspace: WorkspaceView }) {
  return (
    <div className="rounded-lg border border-border/50 px-3 py-2">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium text-foreground">{workspace.name}</span>
        <span className="text-muted-foreground text-xs">{workspace.kind}</span>
        <Mono>{workspace.dir || "."}</Mono>
      </div>
      {workspace.layers.length > 0 && (
        <p className="mt-1 text-muted-foreground text-xs">{workspace.layers.map((layer) => `${layer.layer} ${layer.files}`).join(" · ")}</p>
      )}
      {workspace.internalDependencies.length > 0 && (
        <p className="mt-1 text-muted-foreground text-xs">uses {workspace.internalDependencies.join(", ")}</p>
      )}
    </div>
  );
}

export function WorkspaceList({ workspaces }: { readonly workspaces: ProjectOverview["workspaces"] }) {
  return (
    <ResultList
      title="Applications and packages"
      list={workspaces}
      empty="No workspaces found; the project is treated as one package."
      keyOf={(workspace) => `${workspace.kind}:${workspace.name}`}
      render={(workspace) => <WorkspaceRow workspace={workspace} />}
    />
  );
}
