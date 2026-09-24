import type { ReactNode } from "react";
import type { CappedList } from "../types";

interface ResultListProps<T> {
  readonly title: string;
  readonly list: CappedList<T>;
  readonly empty: string;
  readonly keyOf: (item: T) => string;
  readonly render: (item: T) => ReactNode;
}

export function ResultList<T>({ title, list, empty, keyOf, render }: ResultListProps<T>) {
  return (
    <section className="min-w-0">
      <h3 className="mb-2 text-muted-foreground text-xs uppercase tracking-[0.12em]">{title}</h3>
      {list.items.length === 0 ? (
        <p className="text-muted-foreground text-sm">{empty}</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {list.items.map((item) => (
            <li key={keyOf(item)} className="min-w-0 break-words">{render(item)}</li>
          ))}
          {list.hidden > 0 && <li className="text-muted-foreground text-xs">(+{list.hidden} more)</li>}
        </ul>
      )}
    </section>
  );
}

export function Mono({ children }: { readonly children: ReactNode }) {
  return <span className="font-mono text-xs">{children}</span>;
}
