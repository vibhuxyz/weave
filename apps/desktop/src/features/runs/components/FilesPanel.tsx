import { useShallow } from "zustand/react/shallow";
import { MAX_VISIBLE_FILES } from "../constants";
import { selectFiles, useRunStore } from "../store";

const CHANGE_MARK = { created: "+", modified: "✓", deleted: "−" } as const;
const CHANGE_CLASS = {
  created: "text-agent-success",
  modified: "text-agent-progress-fg",
  deleted: "text-agent-critical-fg",
} as const;

export function FilesPanel() {
  const { files, hiddenFileCount } = useRunStore(useShallow(selectFiles));
  if (files.length === 0) return null;
  const visible = files.slice(0, MAX_VISIBLE_FILES);
  const hidden = hiddenFileCount + (files.length - visible.length);

  return (
    <section aria-label="Files changed" className="flex flex-col gap-1 border-agent-border border-t pt-2">
      <span className="font-medium text-[11px] text-agent-text-muted">Files · {files.length}</span>
      <ul className="flex flex-col gap-0.5">
        {visible.map((file) => (
          <li key={file.path} className="flex min-w-0 items-center gap-2">
            <span className={`shrink-0 font-mono text-[11px] ${CHANGE_CLASS[file.change]}`} aria-hidden="true">
              {CHANGE_MARK[file.change]}
            </span>
            <span className="truncate font-mono text-[11px] text-agent-text-faint" title={`${file.change} by ${file.taskId}`}>
              {file.path}
            </span>
            <span className="shrink-0 text-[11px] text-agent-text-faint">{file.taskId}</span>
          </li>
        ))}
      </ul>
      {hidden > 0 && <span className="text-[11px] text-agent-text-faint">(+{hidden} more files)</span>}
    </section>
  );
}
