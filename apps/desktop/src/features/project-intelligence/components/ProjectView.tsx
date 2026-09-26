import { useEffect } from "react";
import { BudgetSection, type BudgetActions } from "@/features/budgets";
import { FileViewer, useFileStore } from "@/features/files";
import { LocalPathOpenerContext } from "@/shared/ui/ai-elements";
import { useOverviewState, useQueryState } from "../hooks";
import type { ProjectActions } from "../types";
import { OverviewPanel } from "./OverviewPanel";
import { QueryForm } from "./QueryForm";
import { QueryResults } from "./QueryResults";

interface ProjectViewProps {
  readonly actions: ProjectActions;
  readonly budgetActions: BudgetActions;
  readonly projectLabel: string | undefined;
  readonly onOpenFile: (path: string) => void;
}

export function ProjectView({ actions, budgetActions, projectLabel, onOpenFile }: ProjectViewProps) {
  const overview = useOverviewState();
  const query = useQueryState();
  const openFilePath = useFileStore((state) => state.openPath);
  const { readOverview } = actions;
  const isReady = overview.status === "ready";

  useEffect(() => {
    readOverview();
  }, [readOverview]);

  return (
    <LocalPathOpenerContext.Provider value={onOpenFile}>
      <div className="flex min-h-0 flex-1 gap-4 overflow-hidden">
        <div className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-5xl p-8">
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
            <div className="mt-12">
              <BudgetSection actions={budgetActions} />
            </div>
          </div>
        </div>
        {openFilePath !== null && (
          <div className="w-[min(40rem,45%)] shrink-0 py-4 pr-4">
            <FileViewer key={openFilePath} />
          </div>
        )}
      </div>
    </LocalPathOpenerContext.Provider>
  );
}
