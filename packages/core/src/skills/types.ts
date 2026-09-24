import type { Layer } from "../context/index.ts";

export interface SkillTriggers {
  readonly languages?: readonly string[];
  readonly frameworks?: readonly string[];
  readonly packages?: readonly string[];
  readonly layers?: readonly Layer[];
  readonly keywords?: readonly string[];
  readonly paths?: readonly string[];
  readonly refines?: string;
}

export interface RegisteredSkill {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly source: "builtin" | "project";
  readonly body: string | null;
  readonly sourcePath: string | null;
  readonly triggers: SkillTriggers;
}

export interface SkillQuery {
  readonly text: string;
  readonly paths: readonly string[];
  readonly languages: readonly string[];
  readonly frameworks: readonly string[];
  readonly packages: readonly string[];
  readonly layers: readonly Layer[];
}

export interface ResolvedSkill {
  readonly skill: RegisteredSkill;
  readonly score: number;
  readonly reasons: readonly string[];
}
