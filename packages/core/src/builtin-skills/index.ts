import { apiConventionsSkill } from "./api-conventions.skill.ts";
import { backendSkill } from "./backend.skill.ts";
import { databaseSkill } from "./database.skill.ts";
import { frontendSkill } from "./frontend.skill.ts";
import { securitySkill } from "./security.skill.ts";
import { testingSkill } from "./testing.skill.ts";
import { typescriptSkill } from "./typescript.skill.ts";
import type { BuiltinSkill } from "./types.ts";

export type { BuiltinSkill } from "./types.ts";

export const BUILTIN_SKILLS: readonly BuiltinSkill[] = [
  typescriptSkill,
  frontendSkill,
  backendSkill,
  apiConventionsSkill,
  databaseSkill,
  securitySkill,
  testingSkill,
];

export function formatBuiltinSkillsBlock(entries: readonly BuiltinSkill[]): string {
  if (entries.length === 0) return "";
  const body = entries.map((s) => `## ${s.name}\n${s.body}`).join("\n\n");
  return ["<builtin-skills>", body, "</builtin-skills>"].join("\n");
}
