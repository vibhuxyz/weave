import { MAX_PINNED_SKILL_NAMES, MAX_SKILL_NAME_LENGTH } from "./constants.ts";

export function sanitizeSkillNames(raw: unknown): readonly string[] {
  if (!Array.isArray(raw)) return [];
  const names = raw
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && value.length <= MAX_SKILL_NAME_LENGTH);
  return [...new Set(names)].sort().slice(0, MAX_PINNED_SKILL_NAMES);
}
