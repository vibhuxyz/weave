import type { Employee, RegisteredSkill } from "@weave/core";
import type { EmployeeRef, SkillView, UnknownSkill } from "../shared/index.ts";

export interface SkillListing {
  readonly skills: readonly SkillView[];
  readonly unknownSkills: readonly UnknownSkill[];
}

export interface SkillListingInput {
  readonly skills: readonly RegisteredSkill[];
  readonly overridden: readonly string[];
  readonly employees: readonly Employee[];
}

function usersBySkill(employees: readonly Employee[]): ReadonlyMap<string, readonly EmployeeRef[]> {
  const users = new Map<string, EmployeeRef[]>();
  for (const employee of employees) {
    for (const skill of new Set(employee.skills)) {
      users.set(skill, [...(users.get(skill) ?? []), { id: employee.id, name: employee.name }]);
    }
  }
  return users;
}

function byName(a: { readonly name: string }, b: { readonly name: string }): number {
  return a.name.localeCompare(b.name);
}

export function toSkillViews(input: SkillListingInput): SkillListing {
  const users = usersBySkill(input.employees);
  const overridden = new Set(input.overridden);
  const skills = input.skills.map((skill): SkillView => ({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    source: skill.source,
    sourcePath: skill.sourcePath,
    replacesBuiltin: skill.source === "project" && overridden.has(skill.name),
    triggers: skill.triggers,
    usedBy: [...(users.get(skill.name) ?? [])].sort(byName),
  }));
  const known = new Set(input.skills.map((skill) => skill.name));
  const unknownSkills = [...users.entries()]
    .filter(([name]) => !known.has(name))
    .map(([name, usedBy]) => ({ name, usedBy: [...usedBy].sort(byName) }));
  return { skills: [...skills].sort(byName), unknownSkills: unknownSkills.sort(byName) };
}
