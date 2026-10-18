import { cn } from "@/shared/lib";
import { filterByScope, type SkillScope } from "../lib";
import type { SkillView } from "../types";

const SCOPES = [
  { id: "all", label: "All" },
  { id: "in-use", label: "In use" },
  { id: "unused", label: "Unused" },
] as const satisfies readonly { readonly id: SkillScope; readonly label: string }[];

interface SkillScopeTabsProps {
  readonly skills: readonly SkillView[];
  readonly scope: SkillScope;
  readonly onChange: (scope: SkillScope) => void;
}

export function SkillScopeTabs({ skills, scope, onChange }: SkillScopeTabsProps) {
  return (
    <div role="group" aria-label="Show skills" className="flex flex-wrap items-center gap-2">
      {SCOPES.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-pressed={scope === item.id}
          onClick={() => onChange(item.id)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs transition-colors",
            scope === item.id ? "border-primary bg-primary/15 text-foreground" : "border-border/60 text-muted-foreground hover:text-foreground",
          )}
        >
          {item.label} ({filterByScope(skills, item.id).length})
        </button>
      ))}
    </div>
  );
}
