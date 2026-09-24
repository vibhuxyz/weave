import type { ServerMessage, SkillView, UnknownSkill } from "../../../server/index.ts";

export type { SkillView, UnknownSkill };

export type SkillListingMessage = Extract<ServerMessage, { readonly type: "skills" | "skills-failed" }>;

export type SkillListing =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly skills: readonly SkillView[]; readonly unknownSkills: readonly UnknownSkill[] }
  | { readonly status: "error"; readonly message: string };

export interface TriggerGroup {
  readonly label: string;
  readonly values: readonly string[];
}
