import type { ErrorBlock as ErrorBlockModel } from "../normalize/types";

export function ErrorBlock({ block }: { block: ErrorBlockModel }) {
  return (
    <section className="rounded-lg border border-agent-critical/50 bg-agent-critical-bg p-4 text-agent-critical-fg text-sm">
      {block.message}
    </section>
  );
}

