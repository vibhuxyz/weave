import type { ProjectQueryResult } from "../types";
import { Mono, ResultList } from "./ResultList";

export function ImpactSection({ impact }: { readonly impact: ProjectQueryResult["impact"] }) {
  if (impact.seedFiles.length === 0) return null;
  return (
    <section className="space-y-4 rounded-xl border border-border/50 p-4">
      <div>
        <h3 className="font-medium text-foreground text-sm">If these files change</h3>
        <p className="mt-1 text-muted-foreground text-xs">
          Starting from {impact.seedFiles.join(", ")}, following imports and calls up to 3 steps back
          {impact.workspaces.length > 0 && `, across ${impact.workspaces.join(", ")}`}.
          {impact.isTruncated && " The search hit its limit, so there may be more."}
        </p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <ResultList title="Files that depend on them" list={impact.dependents} empty="Nothing imports them." keyOf={(reach) => reach.id} render={(reach) => <><Mono>{reach.id}</Mono> <span className="text-muted-foreground text-xs">{reach.depth} {reach.depth === 1 ? "step" : "steps"}</span></>} />
        <ResultList title="Functions that call into them" list={impact.callers} empty="No callers found." keyOf={(reach) => reach.id} render={(reach) => <><Mono>{reach.id}</Mono> <span className="text-muted-foreground text-xs">{reach.depth} {reach.depth === 1 ? "step" : "steps"}</span></>} />
        <ResultList title="APIs affected" list={impact.apis} empty="No API routes affected." keyOf={(api) => `${api.method} ${api.path} ${api.file}`} render={(api) => <><Mono>{api.method} {api.path}</Mono> <span className="text-muted-foreground text-xs">{api.file}:{api.line}</span></>} />
        <ResultList title="Tests to run" list={impact.tests} empty="No tests cover them." keyOf={(path) => path} render={(path) => <Mono>{path}</Mono>} />
      </div>
    </section>
  );
}
