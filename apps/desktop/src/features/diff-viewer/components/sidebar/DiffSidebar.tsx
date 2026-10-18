import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/shared/lib";
import { folderPaths } from "../../model";
import type { TreeNode } from "../../model";
import type { Commit, DiffSource } from "../../types";
import { CommitList } from "../header";
import { FileTree } from "./FileTree";

export function DiffSidebar({
  tree,
  commits,
  source,
  selectedPath,
  onSelectFile,
  onPickSource,
}: {
  readonly tree: readonly TreeNode[];
  readonly commits: readonly Commit[];
  readonly source: DiffSource;
  readonly selectedPath: string | null;
  readonly onSelectFile: (path: string) => void;
  readonly onPickSource: (source: DiffSource) => void;
}) {
  const allFolders = useMemo(() => folderPaths(tree), [tree]);
  const [openFolders, setOpenFolders] = useState<ReadonlySet<string>>(() => new Set(allFolders));

  useEffect(() => {
    setOpenFolders(new Set(allFolders));
  }, [allFolders]);

  const toggleFolder = useCallback((path: string) => {
    setOpenFolders((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const pickCommit = useCallback((commit: Commit) => onPickSource({ kind: "commit", sha: commit.sha }), [onPickSource]);
  const pickAll = useCallback(() => onPickSource({ kind: "working", base: null }), [onPickSource]);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-agent-border border-r">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
        <FileTree
          nodes={tree}
          depth={0}
          openFolders={openFolders}
          selectedPath={selectedPath}
          onToggleFolder={toggleFolder}
          onSelectFile={onSelectFile}
        />
      </div>
      <div className="flex max-h-[45%] min-h-0 shrink-0 flex-col border-agent-border border-t">
        <button
          type="button"
          onClick={pickAll}
          className={cn(
            "shrink-0 px-3 py-2 text-left text-[13px] text-agent-text-bright hover:bg-diff-tree-row-hover-bg",
            source.kind === "working" && "bg-diff-tree-row-active-bg",
          )}
        >
          All changes
        </button>
        <CommitList
          commits={commits}
          activeSha={source.kind === "commit" ? source.sha : null}
          onPick={pickCommit}
          withSearch={false}
        />
      </div>
    </aside>
  );
}
