import { useState } from "react";
import { ChevronRightIcon, CodeXmlIcon, FileDiffIcon } from "lucide-react";
import { cn } from "@/shared/lib";
import { relativePath, type TurnDiff } from "@/agent/diff";
import { DiffStat } from "./tools";

const FILES_SHOWN_FIRST = 3;

const ROW = "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-agent-surface-hover";

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
    <section className={cn("divide-y divide-agent-border overflow-hidden rounded-xl border", isActive ? "border-agent-accent/40" : "border-agent-border")}>
      <button type="button" onClick={() => onOpenDiff?.()} className={ROW}>
        <FileDiffIcon className="size-4 shrink-0 text-agent-text-faint" />
        <span className="flex-1 text-agent-text-bright text-sm">
          Edited {count} file{count === 1 ? "" : "s"}
        </span>
        <DiffStat additions={diff.additions} deletions={diff.deletions} />
        <ChevronRightIcon className="size-4 shrink-0 text-agent-text-faint" />
      </button>
      {visible.map((file) => (
        <button key={file.path} type="button" onClick={() => onOpenDiff?.(file.path)} title={relativePath(file.path, projectDir)} className={ROW}>
          <CodeXmlIcon className="size-4 shrink-0 text-agent-text-faint" />
          <span className="min-w-0 flex-1 truncate text-agent-text text-sm">{fileName(file.path)}</span>
          <DiffStat additions={file.additions} deletions={file.deletions} />
          <ChevronRightIcon className="size-4 shrink-0 text-agent-text-faint" />
        </button>
      ))}
      {hiddenCount > 0 && (
        <button type="button" onClick={() => setShowsAll(true)} className={ROW}>
          <span className="size-4 shrink-0" />
          <span className="flex-1 text-agent-text-muted text-sm">Show {hiddenCount} more</span>
          <ChevronRightIcon className="size-4 shrink-0 text-agent-text-faint" />
        </button>
      )}
    </section>
  );
}
