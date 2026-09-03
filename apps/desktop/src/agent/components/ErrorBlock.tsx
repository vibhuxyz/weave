import type { ErrorBlock as ErrorBlockModel } from "../normalize/types";

export function ErrorBlock({ block }: { block: ErrorBlockModel }) {
  return (
    <section className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-destructive text-sm">
      {block.message}
    </section>
  );
}

