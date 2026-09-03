import type { CodeBlock as CodeBlockModel } from "../normalize/types";

export function CodeBlockView({ block }: { block: CodeBlockModel }) {
  return (
    <section className="overflow-hidden rounded-lg border border-[#2f2b36] bg-[#0d0e12] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      {(block.title || block.file) && (
        <div className="flex items-center justify-between border-[#27242d] border-b bg-[#15151d] px-3 py-2 text-xs">
          <span className="font-mono text-[#d7d1dc]">
            {block.title ?? block.file}
          </span>
          {block.file && <span className="font-mono text-[#75d99a]">{block.file}</span>}
        </div>
      )}
      <pre className="overflow-x-auto p-3 text-[#d7d1dc] text-xs leading-6">
        <code>{block.code}</code>
      </pre>
    </section>
  );
}
