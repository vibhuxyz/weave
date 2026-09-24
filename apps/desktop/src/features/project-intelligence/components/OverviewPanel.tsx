import type { OverviewState, ProjectOverview } from "../types";
import { Mono, ResultList } from "./ResultList";
import { WorkspaceList } from "./WorkspaceList";

const NOTICE = "rounded-xl border border-border/50 border-dashed p-6 text-center text-muted-foreground text-sm";

const COUNT_LABELS = [
  ["files", "Files"],
  ["symbols", "Symbols"],
  ["imports", "Imports"],
  ["calls", "Calls"],
  ["apis", "APIs"],
  ["events", "Events"],
  ["externalPackages", "Packages used"],
] as const satisfies readonly (readonly [keyof ProjectOverview["counts"], string])[];

function Summary({ overview }: { readonly overview: ProjectOverview }) {
  const { repository, stack } = overview;
  const stackText = [...stack.languages, ...stack.frameworks, ...(stack.packageManager ? [stack.packageManager] : [])].join(", ");
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        {repository.isGitRepo ? <>On <Mono>{repository.branch ?? "detached"}</Mono> at <Mono>{repository.head ?? "no commits"}</Mono></> : "Not a git repository"}
        {stackText && ` · ${stackText}`}
      </p>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {COUNT_LABELS.map(([key, label]) => (
          <div key={key} className="rounded-lg border border-border/50 px-3 py-2">
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="font-medium text-foreground text-lg tabular-nums">{overview.counts[key]}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function OverviewPanel({ state, hasProject }: { readonly state: OverviewState; readonly hasProject: boolean }) {
  switch (state.status) {
    case "idle":
      return <p className={NOTICE}>{hasProject ? "Connecting to the project…" : "Open a project to see what Weave knows about it."}</p>;
    case "loading":
      return <p role="status" className={NOTICE}>Reading the project. The first scan of a large repository takes a few seconds…</p>;
    case "error":
      return <p role="alert" className={NOTICE}>{state.message}</p>;
    case "ready":
      return (
        <div className="space-y-8">
          <Summary overview={state.overview} />
          <div className="grid gap-8 lg:grid-cols-2">
            <WorkspaceList workspaces={state.overview.workspaces} />
            <ResultList
              title="Recent changes"
              list={state.overview.recentChanges}
              empty="No commits yet."
              keyOf={(change) => change.sha}
              render={(change) => <><Mono>{change.sha}</Mono> {change.subject} <span className="text-muted-foreground text-xs">({change.fileCount} files)</span></>}
            />
          </div>
          {state.overview.skipped.items.length > 0 && (
            <ResultList title="Left out of the model" list={state.overview.skipped} empty="" keyOf={(item) => item.path} render={(item) => <><Mono>{item.path}</Mono>: {item.reason}</>} />
          )}
        </div>
      );
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}
