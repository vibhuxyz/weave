import type { ProjectQueryResult, QueryState } from "../types";
import { ImpactSection } from "./ImpactSection";
import { Mono, ResultList } from "./ResultList";

function pathRow(path: string) {
  return <Mono>{path}</Mono>;
}

function Results({ result }: { readonly result: ProjectQueryResult }) {
  return (
    <div className="space-y-8">
      <p className="text-muted-foreground text-sm">
        {result.application ? <>Most likely in <span className="text-foreground">{result.application.name}</span> ({result.application.kind}, <Mono>{result.application.dir || "."}</Mono>)</> : "No single application stands out."}
        {result.terms.length > 0 && <> · matched on {result.terms.join(", ")}</>}
      </p>
      <div className="grid gap-8 md:grid-cols-2">
        <ResultList title="Relevant files" list={result.files} empty="No file matches." keyOf={(file) => file.path} render={(file) => <><Mono>{file.path}</Mono>{file.reasons.length > 0 && <span className="block text-muted-foreground text-xs">{file.reasons.join("; ")}</span>}</>} />
        <ResultList title="Symbols" list={result.symbols} empty="No symbol matches." keyOf={(symbol) => `${symbol.file}:${symbol.line}:${symbol.name}`} render={(symbol) => <><Mono>{symbol.name}</Mono> <span className="text-muted-foreground text-xs">{symbol.kind}, {symbol.file}:{symbol.line}</span></>} />
        <ResultList title="API contracts" list={result.apis} empty="No API routes match." keyOf={(api) => `${api.method} ${api.path} ${api.file}`} render={(api) => <><Mono>{api.method} {api.path}</Mono> <span className="text-muted-foreground text-xs">{api.file}:{api.line}</span></>} />
        <ResultList title="Events" list={result.events} empty="No events match." keyOf={(event) => `${event.role}:${event.name}:${event.file}:${event.line}`} render={(event) => <><Mono>{event.name}</Mono> <span className="text-muted-foreground text-xs">{event.role}s in {event.file}</span></>} />
        <ResultList title="They import" list={result.imports} empty="No imports." keyOf={(path) => path} render={pathRow} />
        <ResultList title="Imported by" list={result.dependents} empty="Nothing imports them." keyOf={(path) => path} render={pathRow} />
        <ResultList title="Called by" list={result.callers} empty="No callers." keyOf={(id) => id} render={pathRow} />
        <ResultList title="They call" list={result.callees} empty="No calls out." keyOf={(id) => id} render={pathRow} />
        <ResultList title="Tests" list={result.tests} empty="No related tests." keyOf={(path) => path} render={pathRow} />
        <ResultList title="Verify with" list={result.commands} empty="No verification commands found." keyOf={(step) => `${step.cwd}:${step.command}`} render={(step) => <><Mono>{step.command}</Mono> <span className="text-muted-foreground text-xs">in {step.cwd || "."}</span></>} />
      </div>
      <ResultList title="Recent changes to these files" list={result.recentChanges} empty="No recent commits touch them." keyOf={(change) => change.sha} render={(change) => <><Mono>{change.sha}</Mono> {change.subject}</>} />
      <ImpactSection impact={result.impact} />
    </div>
  );
}

export function QueryResults({ state }: { readonly state: QueryState }) {
  switch (state.status) {
    case "idle":
      return <p className="text-muted-foreground text-sm">Describe a change to see the files, APIs, dependencies, tests and impact Weave would work from. No model call is made.</p>;
    case "loading":
      return <p role="status" className="text-muted-foreground text-sm">Searching for “{state.text}”…</p>;
    case "error":
      return <p role="alert" className="text-destructive text-sm">{state.message}</p>;
    case "ready":
      return <Results result={state.result} />;
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}
