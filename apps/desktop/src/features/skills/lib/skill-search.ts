import type { SkillView, TriggerGroup } from "../types";

const TRIGGER_LABELS = [
  ["languages", "Languages"],
  ["frameworks", "Frameworks"],
  ["packages", "Packages"],
  ["layers", "Layers"],
  ["paths", "Paths"],
  ["keywords", "Keywords"],
] as const satisfies readonly (readonly [keyof SkillView["triggers"], string])[];

export function triggerGroupsOf(triggers: SkillView["triggers"]): readonly TriggerGroup[] {
  const groups = TRIGGER_LABELS.flatMap(([key, label]) => {
    const values = triggers[key] ?? [];
    return values.length > 0 ? [{ label, values }] : [];
  });
  return triggers.refines ? [...groups, { label: "Refines", values: [triggers.refines] }] : groups;
}

function searchableText(skill: SkillView): string {
  const triggerValues = triggerGroupsOf(skill.triggers).flatMap((group) => group.values);
  const employees = skill.usedBy.flatMap((employee) => [employee.id, employee.name]);
  return [skill.name, skill.description, ...triggerValues, ...employees].join("\n").toLowerCase();
}

export function filterSkills(skills: readonly SkillView[], query: string): readonly SkillView[] {
  const words = query.toLowerCase().split(/\s+/).filter((word) => word !== "");
  if (words.length === 0) return skills;
  return skills.filter((skill) => {
    const text = searchableText(skill);
    return words.every((word) => text.includes(word));
  });
}
