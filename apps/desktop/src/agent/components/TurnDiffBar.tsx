import { useState } from "react";
import { ChevronRightIcon, FileDiffIcon } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { relativePath, type TurnDiff } from "../diff/turnDiff";

/**
 * The turn's result line: what the agent changed, as one row. "Show files"
 * opens the list in place; a file row hands that file to the inspector, and
 * "Open diff" hands it the whole change set.
 */
export function TurnDiffBar({
  diff,
  onOpenDiff,
  active,
  projectDir,
}: {
  diff: TurnDiff;
  /** Open the inspector; a path focuses that file's diff. */
  onOpenDiff?: (path?: string) => void;
  active?: boolean;
  projectDir?: string | null;
}) {
  const [showFiles, setShowFiles] = useState(false);
  const count = diff.files.length;

  return (
    <section
      className={cn(
        "rounded-xl border bg-agent-surface-raised",
        active ? "border-agent-accent/40" : "border-agent-border",
      )}
    >
      <div className="flex items-center gap-3 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setShowFiles((v) => !v)}
          aria-expanded={showFiles}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <ChevronRightIcon
            className={cn(
              "size-4 shrink-0 text-agent-text-faint transition-transform duration-150",
              showFiles && "rotate-90",
            )}
          />
          <span className="shrink-0 font-medium text-agent-text-bright text-sm">
            {count} changed file{count === 1 ? "" : "s"}
          </span>
          <span className="shrink-0 font-mono text-xs">
            <span className="text-agent-success">+{diff.additions}</span>{" "}
            <span className="text-agent-critical-fg">−{diff.deletions}</span>
          </span>
          <span className="truncate text-agent-text-faint text-xs">
            {showFiles ? "Hide files" : "Show files"}
          </span>
        </button>

        {onOpenDiff && (
          <button
            type="button"
            onClick={() => onOpenDiff()}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-colors duration-150 ease-out",
              active
                ? "border-agent-accent/50 bg-agent-accent-wash text-agent-text-bright"
                : "border-agent-border bg-agent-surface-hover text-agent-text hover:text-agent-text-bright",
            )}
          >
            <FileDiffIcon className="size-3.5" />
            Open diff
          </button>
        )}
      </div>

      {showFiles && (
        <div className="flex flex-col border-agent-border border-t px-2 py-1.5">
          {diff.files.map((file) => {
            const shown = relativePath(file.path, projectDir);
            return (
              <button
                key={file.path}
                type="button"
                onClick={() => onOpenDiff?.(file.path)}
                title={`Open ${shown} in the inspector`}
                className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 ease-out hover:bg-agent-surface-hover"
              >
                <span className="truncate font-mono text-[11px] text-agent-text">
                  {shown}
                </span>
                <span className="ml-auto shrink-0 font-mono text-[11px]">
                  <span className="text-agent-success">+{file.additions}</span>{" "}
                  <span className="text-agent-critical-fg">−{file.deletions}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
