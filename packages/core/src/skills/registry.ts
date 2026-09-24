import { BUILTIN_SKILLS, type BuiltinSkill } from "../builtin-skills/index.ts";
import type { SkillEntry } from "../discovery/index.ts";
import { BUILTIN_TRIGGERS } from "./builtin-triggers.ts";
import { nodeSkill, postgresSkill } from "./extra-builtins.ts";
import type { RegisteredSkill, SkillTriggers } from "./types.ts";

export const DEFAULT_BUILTIN_SKILLS: readonly BuiltinSkill[] = [...BUILTIN_SKILLS, nodeSkill, postgresSkill];

const GLOB_HINT = /[*/]/;

function projectTriggers(entry: SkillEntry): SkillTriggers {
  const appliesTo = entry.appliesTo ?? [];
  return {
    paths: appliesTo.filter((value) => GLOB_HINT.test(value)),
    keywords: appliesTo.filter((value) => !GLOB_HINT.test(value)).map((value) => value.toLowerCase()),
  };
}

export interface SkillRegistry {
  readonly skills: readonly RegisteredSkill[];
  readonly overridden: readonly string[];
}

export function buildSkillRegistry(project: readonly SkillEntry[], builtin: readonly BuiltinSkill[] = DEFAULT_BUILTIN_SKILLS): SkillRegistry {
  const fromProject: RegisteredSkill[] = project.map((entry) => ({
    id: `project:${entry.name}`,
    name: entry.name,
    description: entry.description,
    source: "project",
    body: null,
    sourcePath: entry.sourcePath,
    triggers: projectTriggers(entry),
  }));
  const projectNames = new Set(project.map((entry) => entry.name));
  const fromBuiltin: RegisteredSkill[] = builtin
    .filter((skill) => !projectNames.has(skill.name))
    .map((skill) => ({ id: `builtin:${skill.name}`, name: skill.name, description: skill.description, source: "builtin", body: skill.body, sourcePath: null, triggers: BUILTIN_TRIGGERS[skill.name] ?? {} }));
  return {
    skills: [...fromBuiltin, ...fromProject].sort((a, b) => a.id.localeCompare(b.id)),
    overridden: builtin.filter((skill) => projectNames.has(skill.name)).map((skill) => skill.name).sort(),
  };
}
