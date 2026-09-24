import { useState } from "react";
import { ChevronRightIcon, FileDiffIcon } from "lucide-react";
import { cn } from "@/shared/lib";
import { relativePath, type TurnDiff } from "@/agent/diff";
import { fileIconFor } from "./file-icon";
import { DiffStat } from "./tools";

const FILES_SHOWN_FIRST = 3;

const ROW = "flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm transition-colors hover:bg-foreground/[0.04]";

function fileName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

export function FilesChanged({
  diff,
  projectDir,
  isActive = false,
  onOpenDiff,
}: {
  readonly diff: TurnDiff;
  readonly projectDir: string | null;
  readonly isActive?: boolean;
  readonly onOpenDiff?: (path?: string) => void;
}) {
  const [showsAll, setShowsAll] = useState(false);
  const count = diff.files.length;
  const visible = showsAll ? diff.files : diff.files.slice(0, FILES_SHOWN_FIRST);
  const hiddenCount = count - visible.length;
  return (
    <section className={cn("overflow-hidden rounded-xl border bg-foreground/[0.03] py-1", isActive ? "border-agent-accent/40" : "border-agent-border")}>
      <button type="button" onClick={() => onOpenDiff?.()} className={ROW}>
        <FileDiffIcon className="size-4 shrink-0 text-agent-text-faint" />
        <span className="flex-1 text-agent-text-bright">
          Edited {count} file{count === 1 ? "" : "s"}
        </span>
        <DiffStat additions={diff.additions} deletions={diff.deletions} />
        <ChevronRightIcon className="size-4 shrink-0 text-agent-text-faint" />
      </button>
      {visible.map((file) => {
        const FileIcon = fileIconFor(file.path);
        return (
          <button key={file.path} type="button" onClick={() => onOpenDiff?.(file.path)} title={relativePath(file.path, projectDir)} className={ROW}>
            <FileIcon className="size-4 shrink-0 text-agent-text-faint" />
            <span className="min-w-0 flex-1 truncate text-agent-text-bright">{fileName(file.path)}</span>
            <DiffStat additions={file.additions} deletions={file.deletions} />
            <ChevronRightIcon className="size-4 shrink-0 text-agent-text-faint" />
          </button>
        );
      })}
      {hiddenCount > 0 && (
        <button type="button" onClick={() => setShowsAll(true)} className={ROW}>
          <span className="size-4 shrink-0" />
          <span className="flex-1 text-agent-text-muted">Show {hiddenCount} more</span>
          <ChevronRightIcon className="size-4 shrink-0 text-agent-text-faint" />
        </button>
      )}
    </section>
  );
}
