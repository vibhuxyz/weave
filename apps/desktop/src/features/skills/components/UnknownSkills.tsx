import type { UnknownSkill } from "../types";
import { MAX_UNKNOWN_SHOWN } from "./constants";

export function UnknownSkills({ skills }: { readonly skills: readonly UnknownSkill[] }) {
  if (skills.length === 0) return null;
  const shown = skills.slice(0, MAX_UNKNOWN_SHOWN);
  const hidden = skills.length - shown.length;
  return (
    <div role="status" className="rounded-xl border border-border/60 bg-card/60 px-4 py-3 text-sm">
      <p className="text-foreground">Employees list skills that no skill file defines</p>
      <ul className="mt-2 space-y-1 text-muted-foreground text-xs">
        {shown.map((skill) => (
          <li key={skill.name} className="break-words">
            <span className="font-mono">{skill.name}</span>: {skill.usedBy.map((employee) => employee.name).join(", ")}
          </li>
        ))}
        {hidden > 0 && <li>(+{hidden} more)</li>}
      </ul>
    </div>
  );
}
