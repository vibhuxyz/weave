import { useDeferredValue, useId, useMemo, useState } from "react";
import { SearchIcon } from "lucide-react";
import { FIELD, LABEL } from "@/features/projects/components";
import { useSkillListing } from "@/features/skills/hooks";
import { cn } from "@/shared/lib";
import { ChoiceCard } from "../employee-choices";
import { skillChoices, toggledSkills } from "./skill-choices";

const MAX_CHOICES_SHOWN = 80;
const NOT_FOUND_DETAIL = "Not found in this project. The name stays saved.";

interface SkillChecklistProps {
  readonly value: readonly string[];
  readonly hint: string;
  readonly onChange: (next: string[]) => void;
}

export function SkillChecklist({ value, hint, onChange }: SkillChecklistProps) {
  const listing = useSkillListing();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const searchId = useId();
  const isReady = listing.status === "ready";
  const catalog = isReady ? listing.skills : [];
  const choices = useMemo(() => skillChoices(catalog, value, deferredQuery), [catalog, value, deferredQuery]);
  const shown = choices.slice(0, MAX_CHOICES_SHOWN);
  const hidden = choices.length - shown.length;
  return (
    <fieldset className="space-y-3">
      <legend className={LABEL}>Skills ({value.length} selected)</legend>
      <p className="text-muted-foreground text-xs">{hint}</p>
      {!isReady && <p className="text-muted-foreground text-xs">Open a project to load its skills. Names already saved stay.</p>}
      {isReady && catalog.length === 0 && <p className="text-muted-foreground text-xs">No skills found yet. Add a folder with a SKILL.md under .agents/skills.</p>}
      <div className="relative">
        <label htmlFor={searchId} className="sr-only">Search skills</label>
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input id={searchId} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search skills" className={cn(FIELD, "h-10 pl-9")} />
      </div>
      <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
        {shown.map((choice) => (
          <ChoiceCard
            key={choice.name}
            isOn={choice.isSelected}
            label={choice.name}
            detail={choice.isFound ? choice.description || undefined : NOT_FOUND_DETAIL}
            onToggle={() => onChange(toggledSkills(value, choice.name))}
          />
        ))}
        {choices.length === 0 && isReady && <p className="text-muted-foreground text-xs">No skill matches that search.</p>}
        {hidden > 0 && <p className="text-center text-muted-foreground text-xs">(+{hidden} more, narrow the search)</p>}
      </div>
    </fieldset>
  );
}
