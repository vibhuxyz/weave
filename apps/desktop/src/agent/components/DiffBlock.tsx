import type { DiffBlock as DiffBlockModel } from "../normalize/types";

export function DiffBlock({ block }: { block: DiffBlockModel }) {
  return (
    <section className="overflow-hidden rounded-lg border border-emerald-500/30 bg-emerald-500/5">
      <div className="border-emerald-500/20 border-b px-3 py-2 font-mono text-emerald-300 text-xs">
        {block.file ?? "diff"}
      </div>
      <pre className="overflow-x-auto p-3 text-xs leading-6">
        <code>{block.diff}</code>
      </pre>
    </section>
  );
}

