import { memo, useId, useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/shared/lib";
import { Badge } from "@/shared/ui";
import { triggerGroupsOf } from "../lib";
import type { SkillView, TriggerGroup } from "../types";
import { MAX_TRIGGER_VALUES_SHOWN } from "./constants";
import { EmployeeBadges } from "./EmployeeBadges";

interface SkillCardProps {
  readonly skill: SkillView;
  readonly onOpenEmployee: (employeeId: string) => void;
}

function sourceText(skill: SkillView): string {
  if (skill.source === "builtin") return "Built-in";
  return skill.replacesBuiltin ? "Project, replaces built-in" : "Project";
}

function TriggerRow({ group }: { readonly group: TriggerGroup }) {
  const hidden = group.values.length - MAX_TRIGGER_VALUES_SHOWN;
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3">
      <dt className="text-muted-foreground">{group.label}</dt>
      <dd className="break-words font-mono">
        {group.values.slice(0, MAX_TRIGGER_VALUES_SHOWN).join(", ")}
        {hidden > 0 && ` (+${hidden} more)`}
      </dd>
    </div>
  );
}

export const SkillCard = memo(function SkillCard({ skill, onOpenEmployee }: SkillCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const detailsId = useId();
  const groups = triggerGroupsOf(skill.triggers);
  return (
    <article className="rounded-xl border border-border/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-medium text-foreground text-sm">{skill.name}</h3>
            <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px] font-medium">{sourceText(skill)}</Badge>
          </div>
          <p className="mt-1 text-muted-foreground text-xs leading-relaxed">{skill.description || "No description."}</p>
        </div>
        <button
          type="button"
          aria-expanded={isExpanded}
          aria-controls={detailsId}
          aria-label={isExpanded ? `Hide details for ${skill.name}` : `Show details for ${skill.name}`}
          onClick={() => setIsExpanded((current) => !current)}
          className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronDownIcon className={cn("size-4 transition-transform", isExpanded && "rotate-180")} />
        </button>
      </div>
      <div className="mt-3">
        <EmployeeBadges employees={skill.usedBy} onOpenEmployee={onOpenEmployee} />
      </div>
      {isExpanded && (
        <div id={detailsId} className="mt-4 space-y-3 border-t border-border/40 pt-3 text-xs">
          <p className="text-muted-foreground">Applies when a task matches:</p>
          {groups.length === 0 ? (
            <p className="text-muted-foreground">No triggers. It is used only when an employee lists it.</p>
          ) : (
            <dl className="space-y-1.5">
              {groups.map((group) => <TriggerRow key={group.label} group={group} />)}
            </dl>
          )}
          {skill.sourcePath && <p className="break-words font-mono text-muted-foreground">{skill.sourcePath}</p>}
        </div>
      )}
    </article>
  );
});
