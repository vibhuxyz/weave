import type { ErrorBlock as ErrorBlockModel } from "../normalize/types";

export function ErrorBlock({ block }: { block: ErrorBlockModel }) {
  return (
    <section className="rounded-lg border border-[#ff6f6f]/50 bg-[#2a151a] p-4 text-[#ff8b8b] text-sm">
      {block.message}
    </section>
  );
}

