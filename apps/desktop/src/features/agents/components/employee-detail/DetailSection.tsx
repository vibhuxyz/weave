import type { ReactNode } from "react";

export function DetailSection({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="border-t border-border/60 pt-5">
      <h2 className="mb-3 text-sm text-muted-foreground">{title}</h2>
      <div className="text-sm leading-relaxed text-foreground">{children}</div>
    </section>
  );
}

export function ItemList({ items, empty }: { readonly items: readonly string[]; readonly empty: string }) {
  if (items.length === 0) return <p className="text-muted-foreground">{empty}</p>;
  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((item, index) => (
        <li key={`${index}:${item}`} className="break-words">{item}</li>
      ))}
    </ul>
  );
}

export function TagList({ items, empty }: { readonly items: readonly string[]; readonly empty: string }) {
  if (items.length === 0) return <p className="text-muted-foreground">{empty}</p>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item, index) => (
        <li key={`${index}:${item}`} className="rounded-md bg-accent px-2 py-0.5 font-mono text-xs">{item}</li>
      ))}
    </ul>
  );
}

export function FactRow({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_minmax(0,1fr)] gap-3 py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}
