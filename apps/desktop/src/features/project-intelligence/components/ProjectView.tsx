import { useEffect } from "react";
import { useOverviewState, useQueryState } from "../hooks";
import type { ProjectActions } from "../types";
import { OverviewPanel } from "./OverviewPanel";
import { QueryForm } from "./QueryForm";
import { QueryResults } from "./QueryResults";

interface ProjectViewProps {
  readonly actions: ProjectActions;
  readonly projectLabel: string | undefined;
}

export function ProjectView({ actions, projectLabel }: ProjectViewProps) {
  const overview = useOverviewState();
  const query = useQueryState();
  const { readOverview } = actions;
  const isReady = overview.status === "ready";

  useEffect(() => {
    readOverview();
  }, [readOverview]);

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 overflow-y-auto p-8">
      <header className="mb-8">
        <h1 className="font-medium text-foreground text-lg">Project{projectLabel ? `: ${projectLabel}` : ""}</h1>
        <p className="mt-1 text-muted-foreground text-sm">What Weave reads from the repository before any agent starts: its structure, APIs, dependencies and history.</p>
      </header>
      <OverviewPanel state={overview} hasProject={projectLabel !== undefined} />
      <section className="mt-12 space-y-6" aria-label="Search the project">
        <h2 className="font-medium text-base text-foreground">Ask about a change</h2>
        <QueryForm isDisabled={!isReady} isSearching={query.status === "loading"} onSearch={actions.queryProject} />
        <QueryResults state={query} />
      </section>
    </div>
  );
}
