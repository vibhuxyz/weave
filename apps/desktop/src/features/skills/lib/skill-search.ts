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

export type SkillScope = "all" | "in-use" | "unused";

export function filterByScope(skills: readonly SkillView[], scope: SkillScope): readonly SkillView[] {
  switch (scope) {
    case "all":
      return skills;
    case "in-use":
      return skills.filter((skill) => skill.usedBy.length > 0);
    case "unused":
      return skills.filter((skill) => skill.usedBy.length === 0);
    default: {
      const exhaustive: never = scope;
      return exhaustive;
    }
  }
}
