import type { FileChangeBlock as FileChangeBlockModel } from "../normalize/types";

export function FileChangeBlock({ block }: { block: FileChangeBlockModel }) {
  return (
    <section className="rounded-lg border border-[#3a2d34] bg-[#181820] p-4">
      <h3 className="mb-3 font-medium text-sm text-white">Files</h3>
      <div className="space-y-1">
        {block.files.map((file) => (
          <div key={file.path} className="flex items-center gap-3 font-mono text-xs">
            <span className="w-16 shrink-0 text-[#a8a2b3]">{file.status}</span>
            <span className="truncate text-[#d7d1dc]">{file.path}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

