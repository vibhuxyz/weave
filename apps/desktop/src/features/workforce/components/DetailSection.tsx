import type { ReactNode } from "react";

export function DetailSection({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">{title}</h2>
      {children}
    </section>
  );
}

export function Chips({ items, empty }: { readonly items: readonly string[]; readonly empty: string }) {
  if (items.length === 0) return <p className="text-muted-foreground text-sm">{empty}</p>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li key={item} className="rounded-md border border-border bg-secondary/40 px-2 py-0.5 font-mono text-xs text-foreground">{item}</li>
      ))}
    </ul>
  );
}

export function Facts({ rows }: { readonly rows: readonly (readonly [string, string])[] }) {
  return (
    <dl className="grid grid-cols-[10rem_1fr] gap-x-4 gap-y-1.5 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
