import { Controller, type Control } from "react-hook-form";
import { linesOf, type EmployeeFormValues } from "@/features/employees";
import { LABEL } from "@/features/projects/components";
import { useSkillListing } from "@/features/skills/hooks";
import { ChoiceCard } from "../employee-choices";

function selectedNames(value: string): Set<string> {
  return new Set(linesOf(value));
}

function toggleSkill(value: string, name: string, catalog: readonly string[]): string {
  const selected = selectedNames(value);
  if (selected.has(name)) selected.delete(name);
  else selected.add(name);
  const known = new Set(catalog);
  const extras = [...selected].filter((skill) => !known.has(skill)).sort();
  return [...catalog.filter((skill) => selected.has(skill)), ...extras].join("\n");
}

export function SkillPicker({ control }: { readonly control: Control<EmployeeFormValues> }) {
  const listing = useSkillListing();
  const catalog = listing.status === "ready" ? listing.skills : [];
  const names = catalog.map((skill) => skill.name);
  return (
    <Controller
      control={control}
      name="skills"
      render={({ field }) => <SkillList value={field.value} names={names} catalog={catalog} isReady={listing.status === "ready"} onChange={field.onChange} />}
    />
  );
}

function SkillList({ value, names, catalog, isReady, onChange }: { readonly value: string; readonly names: readonly string[]; readonly catalog: readonly { readonly id: string; readonly name: string; readonly description?: string }[]; readonly isReady: boolean; readonly onChange: (next: string) => void }) {
  const selected = selectedNames(value);
  const known = new Set(names);
  const extras = [...selected].filter((name) => !known.has(name)).sort();
  return (
    <fieldset className="space-y-3">
      <legend className={LABEL}>Skills</legend>
      <p className="text-muted-foreground text-xs">Choose the skills this employee follows, such as React or TypeScript.</p>
      {isReady && catalog.length === 0 ? <p className="text-muted-foreground text-xs">No skills found yet. Add a folder with a SKILL.md under .agents/skills.</p> : null}
      {!isReady ? <p className="text-muted-foreground text-xs">Open a project to load its skills. Names already saved stay on this employee.</p> : null}
      <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
        {catalog.map((skill) => (
          <ChoiceCard key={skill.id} isOn={selected.has(skill.name)} label={skill.name} detail={skill.description || undefined} onToggle={() => onChange(toggleSkill(value, skill.name, names))} />
        ))}
        {extras.map((name) => (
          <ChoiceCard key={name} isOn label={name} onToggle={() => onChange(toggleSkill(value, name, names))} />
        ))}
      </div>
    </fieldset>
  );
}
