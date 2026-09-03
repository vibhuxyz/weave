import type { SummaryBlock as SummaryBlockModel } from "../normalize/types";

export function SummaryBlock({ block }: { block: SummaryBlockModel }) {
  return (
    <section className="space-y-2">
      {block.label && (
        <p className="font-mono text-[11px] text-agent-accent uppercase tracking-[0.08em]">
          {block.label}
        </p>
      )}
      <p className="text-base leading-7 text-agent-text-bright">{block.text}</p>
    </section>
  );
}

