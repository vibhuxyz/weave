import { useDeferredValue, useMemo, useState } from "react";
import { cn } from "@/shared/lib";
import type { Commit } from "../../types";

function matches(commit: Commit, query: string): boolean {
  const needle = query.toLowerCase();
  return commit.subject.toLowerCase().includes(needle) || commit.shortSha.includes(needle);
}

export function CommitList({
  commits,
  activeSha,
  onPick,
  withSearch,
}: {
  readonly commits: readonly Commit[];
  readonly activeSha: string | null;
  readonly onPick: (commit: Commit) => void;
  readonly withSearch: boolean;
}) {
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const shown = useMemo(
    () => (deferred ? commits.filter((commit) => matches(commit, deferred)) : commits),
    [commits, deferred],
  );

  return (
    <div className="flex min-h-0 flex-col">
      {withSearch && (
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search commits"
          aria-label="Search commits"
          className="shrink-0 border-diff-menu-border border-b bg-transparent px-3 py-2 text-sm text-agent-text-bright outline-none placeholder:text-agent-text-faint"
        />
      )}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {shown.length === 0 && <p className="px-3 py-2 text-agent-text-faint text-xs">No commits match.</p>}
        {shown.map((commit) => (
          <button
            key={commit.sha}
            type="button"
            onClick={() => onPick(commit)}
            className={cn(
              "flex w-full items-baseline gap-3 px-3 py-1.5 text-left hover:bg-diff-tree-row-hover-bg",
              commit.sha === activeSha && "bg-diff-commit-row-active-bg",
            )}
          >
            <span className="min-w-0 flex-1 truncate text-[13px] text-agent-text-bright">{commit.subject}</span>
            <span className="shrink-0 font-mono text-[11px] text-agent-text-faint">{commit.shortSha}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
