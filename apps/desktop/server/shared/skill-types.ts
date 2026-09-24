import type { SkillTriggers } from "@weave/core";

export interface EmployeeRef {
  readonly id: string;
  readonly name: string;
}

export interface SkillView {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly source: "builtin" | "project";
  readonly sourcePath: string | null;
  readonly replacesBuiltin: boolean;
  readonly triggers: SkillTriggers;
  readonly usedBy: readonly EmployeeRef[];
}

export interface UnknownSkill {
  readonly name: string;
  readonly usedBy: readonly EmployeeRef[];
}

export type SkillClientMessage = { readonly type: "list-skills" };

export type SkillServerMessage =
  | { readonly type: "skills"; readonly skills: readonly SkillView[]; readonly unknownSkills: readonly UnknownSkill[] }
  | { readonly type: "skills-failed"; readonly message: string };

export const SKILL_CLIENT_MESSAGE_TYPES = ["list-skills"] as const;
