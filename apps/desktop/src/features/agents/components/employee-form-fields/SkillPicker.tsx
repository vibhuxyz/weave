import { Controller, type Control } from "react-hook-form";
import { linesOf, type EmployeeFormValues } from "@/features/employees";
import { useSkillListing } from "@/features/skills/hooks";
import { LABEL } from "@/features/projects/components";

function selectedNames(value: string): Set<string> {
  return new Set(linesOf(value));
}

function toggleSkill(value: string, name: string, catalog: readonly string[]): string {
  const selected = selectedNames(value);
  if (selected.has(name)) selected.delete(name);
  else selected.add(name);
  const known = new Set(catalog);
  return [...catalog.filter((skill) => selected.has(skill)), ...[...selected].filter((skill) => !known.has(skill)).sort()].join("\n");
}

export function SkillPicker({ control }: { readonly control: Control<EmployeeFormValues> }) {
  const listing = useSkillListing();
  const catalog = listing.status === "ready" ? listing.skills : [];
  const names = catalog.map((skill) => skill.name);

  return (
    <Controller
      control={control}
      name="skills"
      render={({ field }) => {
        const selected = selectedNames(field.value);
        const known = new Set(names);
        const extras = [...selected].filter((name) => !known.has(name)).sort();
        return (
          <fieldset className="space-y-3">
            <legend className={LABEL}>Skills</legend>
            <p className="text-muted-foreground text-xs">Choose the skills this employee follows, such as React or TypeScript.</p>
            {listing.status === "ready" && catalog.length === 0 && (
              <p className="text-muted-foreground text-xs">No skills found yet. Add a folder with a SKILL.md under .agents/skills.</p>
            )}
            {listing.status !== "ready" && <p className="text-muted-foreground text-xs">Open a project to load its skills. Names already saved stay on this employee.</p>}
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {catalog.map((skill) => (
                <label key={skill.id} className="flex items-start gap-3 rounded-lg border border-border/50 px-3 py-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected.has(skill.name)}
                    onChange={() => field.onChange(toggleSkill(field.value, skill.name, names))}
                  />
                  <span className="min-w-0">
                    <span className="block text-foreground text-sm">{skill.name}</span>
                    {skill.description && <span className="block text-muted-foreground text-xs">{skill.description}</span>}
                  </span>
                </label>
              ))}
              {extras.map((name) => (
                <label key={name} className="flex items-start gap-3 rounded-lg border border-border/50 px-3 py-2">
                  <input type="checkbox" className="mt-1" checked onChange={() => field.onChange(toggleSkill(field.value, name, names))} />
                  <span className="text-foreground text-sm">{name}</span>
                </label>
              ))}
            </div>
          </fieldset>
        );
      }}
    />
  );
}
