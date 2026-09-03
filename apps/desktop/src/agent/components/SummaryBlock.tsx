import type { SummaryBlock as SummaryBlockModel } from "../normalize/types";

export function SummaryBlock({ block }: { block: SummaryBlockModel }) {
  return (
    <section className="space-y-2">
      {block.label && (
        <p className="font-mono text-[11px] text-primary uppercase tracking-[0.08em]">
          {block.label}
        </p>
      )}
      <p className="text-base leading-7">{block.text}</p>
    </section>
  );
}

