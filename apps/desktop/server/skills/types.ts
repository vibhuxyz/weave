export interface PinnedSkill {
  readonly name: string;
  readonly sourcePath: string | null;
  readonly body: string;
}

export interface SkippedSkill {
  readonly name: string;
  readonly reason: string;
}

export interface PinnedSkillsLoad {
  readonly loaded: readonly PinnedSkill[];
  readonly skipped: readonly SkippedSkill[];
}
