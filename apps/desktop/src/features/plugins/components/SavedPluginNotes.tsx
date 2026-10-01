import type { SkillPlugin } from "../hooks";

export function SavedPluginNotes({
  plugins,
  onRemove,
}: {
  readonly plugins: readonly SkillPlugin[];
  readonly onRemove: (id: string) => void;
}) {
  if (plugins.length === 0) return null;
  return (
    <section className="mb-10">
      <h2 className="mb-2 font-medium text-foreground text-sm">Notes added by hand</h2>
      <p className="mb-3 text-muted-foreground text-xs">
        These are old pasted notes, not installed plugins. Remove one when a marketplace plugin covers it.
      </p>
      <ul className="space-y-2">
        {plugins.map((plugin) => (
          <li key={plugin.id} className="flex items-start justify-between gap-3 rounded-xl border border-border/50 px-3 py-2">
            <span className="min-w-0">
              <span className="block truncate text-foreground text-sm">{plugin.name}</span>
              <span className="block text-muted-foreground text-xs">{plugin.description}</span>
            </span>
            <button type="button" className="shrink-0 text-xs underline" onClick={() => onRemove(plugin.id)}>
              Remove
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
