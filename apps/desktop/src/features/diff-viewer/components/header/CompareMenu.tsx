import { CheckIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "@/shared/lib";
import type { BranchRef, Commit, DiffSource, RefsState } from "../../types";
import { CommitList } from "./CommitList";

type Pane = "root" | "branches" | "commits";

const ROW = "flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-agent-text-bright hover:bg-diff-tree-row-hover-bg";

export function CompareMenu({
  refs,
  commits,
  source,
  onPickSource,
}: {
  readonly refs: RefsState | null;
  readonly commits: readonly Commit[];
  readonly source: DiffSource;
  readonly onPickSource: (source: DiffSource) => void;
}) {
  const [pane, setPane] = useState<Pane>("root");
  const base = refs?.defaultBranch ?? null;
  const isAllChanges = source.kind === "working";

  if (pane === "branches") {
    return (
      <BranchPane branches={refs?.branches ?? []} onBack={() => setPane("root")} onPick={(name) => onPickSource({ kind: "working", base: name })} />
    );
  }
  if (pane === "commits") {
    return (
      <div className="flex max-h-80 min-h-0 w-80 flex-col">
        <button type="button" onClick={() => setPane("root")} className={cn(ROW, "shrink-0 border-diff-menu-border border-b")}>
          Back
        </button>
        <CommitList
          commits={commits}
          activeSha={source.kind === "commit" ? source.sha : null}
          onPick={(commit) => onPickSource({ kind: "commit", sha: commit.sha })}
          withSearch
        />
      </div>
    );
  }

  return (
    <div className="w-72 py-1">
      <button type="button" onClick={() => onPickSource({ kind: "working", base })} className={ROW}>
        <span className="flex-1">All changes</span>
        {isAllChanges && <CheckIcon className="size-4 text-agent-low-fg" />}
        <span className="text-agent-text-faint text-xs">vs {base ?? "HEAD"}</span>
      </button>
      <div className="my-1 border-diff-menu-border border-t" />
      <button type="button" onClick={() => setPane("branches")} className={ROW}>
        <span className="flex-1">Compare against</span>
        <span className="text-agent-text-faint text-xs">{source.kind === "working" ? (source.base ?? "HEAD") : (base ?? "HEAD")}</span>
        <ChevronRightIcon className="size-4 text-agent-text-faint" />
      </button>
      <div className="my-1 border-diff-menu-border border-t" />
      <button type="button" onClick={() => setPane("commits")} className={ROW}>
        <span className="flex-1">Commits</span>
        <span className="text-agent-text-faint text-xs">{commits.length}</span>
        <ChevronRightIcon className="size-4 text-agent-text-faint" />
      </button>
    </div>
  );
}

function BranchPane({
  branches,
  onBack,
  onPick,
}: {
  readonly branches: readonly BranchRef[];
  readonly onBack: () => void;
  readonly onPick: (name: string) => void;
}) {
  return (
    <div className="flex max-h-80 w-72 flex-col">
      <button type="button" onClick={onBack} className={cn(ROW, "shrink-0 border-diff-menu-border border-b")}>
        Back
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
        {branches.map((branch) => (
          <button key={branch.name} type="button" onClick={() => onPick(branch.name)} className={ROW}>
            <span className="flex-1 truncate">{branch.name}</span>
            {branch.isCurrent && <span className="text-agent-text-faint text-xs">current</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
