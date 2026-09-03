import type { FileChangeBlock as FileChangeBlockModel } from "../normalize/types";

export function FileChangeBlock({ block }: { block: FileChangeBlockModel }) {
  return (
    <section className="rounded-lg border border-agent-chip-border bg-agent-surface-inset p-4">
      <h3 className="mb-3 font-medium text-sm text-agent-text-bright">Files</h3>
      <div className="space-y-1">
        {block.files.map((file) => (
          <div key={file.path} className="flex items-center gap-3 font-mono text-xs">
            <span className="w-16 shrink-0 text-agent-text-muted">{file.status}</span>
            <span className="truncate text-agent-text">{file.path}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

