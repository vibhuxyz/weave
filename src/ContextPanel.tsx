import { useState } from "react";
import { FolderGitIcon, GitBranchIcon, RefreshCwIcon } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { basename, tildeHome } from "./paths";
import type { GitStatus } from "../server/index.ts";

const TABS = ["Context", "Changes", "Files"] as const;
type Tab = (typeof TABS)[number];

export interface ContextPanelProps {
  projectDir: string;
  git: GitStatus;
  onRefresh: () => void;
}

/** Porcelain codes → a short human word. */
function describe(code: string): string {
  if (code.startsWith("??")) return "new";
  if (code.includes("D")) return "deleted";
  if (code.includes("A")) return "added";
  if (code.includes("R")) return "renamed";
  return "modified";
}

export function ContextPanel({
  projectDir,
  git,
  onRefresh,
}: ContextPanelProps) {
  const [tab, setTab] = useState<Tab>("Context");

  return (
    <aside className="flex w-72 shrink-0 flex-col gap-4 rounded-xl bg-secondary/30 p-4 pt-8">
      <div className="flex items-center gap-4 text-sm">
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setTab(name)}
            className={cn(
              "transition-colors",
              tab === name
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {name}
            {name === "Changes" && git.changes.length > 0 && (
              <span className="ml-1.5 text-muted-foreground text-xs">
                {git.changes.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "Context" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-xs">Active project</p>
            <button
              type="button"
              onClick={onRefresh}
              title="Refresh git state"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <RefreshCwIcon className="size-3.5" />
            </button>
          </div>

          <div className="rounded-lg bg-secondary/70 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <FolderGitIcon className="size-4 shrink-0" />
              <span className="truncate text-sm">{basename(projectDir)}</span>
            </div>
            <p className="truncate pl-6 text-muted-foreground text-xs">
              {tildeHome(projectDir)}
            </p>
          </div>

          <p className="text-muted-foreground text-xs">Branch</p>
          <div className="flex items-center gap-2 rounded-lg bg-secondary/70 px-3 py-2.5">
            <GitBranchIcon className="size-4 shrink-0" />
            <span className="truncate text-sm">
              {git.branch ?? "not a git repo"}
            </span>
          </div>
        </div>
      )}

      {tab === "Changes" && (
        <div className="flex flex-col gap-1 overflow-y-auto">
          {git.changes.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              {git.branch
                ? "No uncommitted changes."
                : "Not a git repository."}
            </p>
          ) : (
            git.changes.map((change) => (
              <div
                key={change.path}
                className="flex items-baseline gap-2 rounded-md px-2 py-1 text-xs hover:bg-secondary/60"
              >
                <span className="w-14 shrink-0 text-muted-foreground">
                  {describe(change.code)}
                </span>
                <span className="truncate font-mono">{change.path}</span>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "Files" && (
        <p className="text-muted-foreground text-xs leading-relaxed">
          A file tree needs a directory-listing call the server does not have
          yet. Changes shows what the agent actually touched.
        </p>
      )}
    </aside>
  );
}
