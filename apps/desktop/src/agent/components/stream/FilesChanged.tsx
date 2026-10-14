import { useState } from "react";
import { relativePath, type TurnDiff } from "@/agent/diff";
import { fileIconFor } from "./file-icon";
import { DisclosureHeader } from "./DisclosureHeader";
import { DiffStat } from "./tools";

const FILES_SHOWN_FIRST = 8;
const MAX_CHANGED_FILES = 40;

function fileName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

function editedLabel(count: number): string {
  return count === 1 ? "Edited 1 file" : `Edited ${count} files`;
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
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <DisclosureHeader open={open} onToggle={() => setOpen((value) => !value)} className={isActive ? "text-agent-text-muted" : undefined}>
        {editedLabel(diff.files.length)}
        <DiffStat additions={diff.additions} deletions={diff.deletions} />
      </DisclosureHeader>
      {open && <ChangedFileList files={diff.files} projectDir={projectDir} onOpenDiff={onOpenDiff} />}
    </div>
  );
}

function ChangedFileList({
  files,
  projectDir,
  onOpenDiff,
}: {
  readonly files: TurnDiff["files"];
  readonly projectDir: string | null;
  readonly onOpenDiff?: (path?: string) => void;
}) {
  const [showsAll, setShowsAll] = useState(false);
  const capped = files.slice(0, MAX_CHANGED_FILES);
  const visible = showsAll ? capped : capped.slice(0, FILES_SHOWN_FIRST);
  const hiddenCount = capped.length - visible.length;
  const omitted = files.length - capped.length;
  return (
    <ul className="flex flex-col border-l border-agent-border/80 pl-3">
      {visible.map((file) => {
        const FileIcon = fileIconFor(file.path);
        return (
          <li key={file.path}>
            <button type="button" onClick={() => onOpenDiff?.(file.path)} title={relativePath(file.path, projectDir)} className="flex w-full items-center gap-2 py-1 text-left text-sm text-agent-text-faint transition-colors hover:text-agent-text">
              <FileIcon className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{fileName(file.path)}</span>
              <DiffStat additions={file.additions} deletions={file.deletions} />
            </button>
          </li>
        );
      })}
      {hiddenCount > 0 && (
        <li>
          <button type="button" onClick={() => setShowsAll(true)} className="py-1 text-left text-agent-text-faint text-xs hover:text-agent-text">
            Show {hiddenCount} more
          </button>
        </li>
      )}
      {showsAll && omitted > 0 && <li className="py-1 text-agent-text-faint text-xs">(+{omitted} more)</li>}
    </ul>
  );
}
