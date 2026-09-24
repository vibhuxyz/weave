import { join } from "node:path";
import { SKILL_DIRS, buildSkillRegistry, discoverSkills, type Employee, type RegisteredSkill } from "@weave/core";
import type { SkillView } from "../shared/index.ts";

const MAX_TRIGGER_LABELS = 8;

function appliesWhen(skill: RegisteredSkill): readonly string[] {
  const { languages, frameworks, packages, layers, keywords, paths, refines } = skill.triggers;
  return [
    ...(languages ?? []).map((value) => `language ${value}`),
    ...(frameworks ?? []).map((value) => `framework ${value}`),
    ...(packages ?? []).map((value) => `package ${value}`),
    ...(layers ?? []).map((value) => `${value} layer`),
    ...(paths ?? []).map((value) => `path ${value}`),
    ...(keywords ?? []).map((value) => `mentions "${value}"`),
    ...(refines ? [`replaces ${refines}`] : []),
  ].slice(0, MAX_TRIGGER_LABELS);
}

export async function listSkills(projectDir: string, employees: readonly Employee[]): Promise<readonly SkillView[]> {
  const project = await discoverSkills(SKILL_DIRS.map((dir) => join(projectDir, dir)));
  const registry = buildSkillRegistry(project);
  return registry.skills.map((skill) => ({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    source: skill.source,
    sourcePath: skill.sourcePath,
    appliesWhen: appliesWhen(skill),
    usedBy: employees.filter((employee) => employee.skills.includes(skill.name)).map((employee) => employee.id),
  }));
}
