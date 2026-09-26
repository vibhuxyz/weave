import { capLines, flatten } from "../shared/index.ts";
import type { SkillRegistry } from "./registry.ts";

const MAX_CATALOG_BYTES = 4_000;
const MAX_DESCRIPTION_CHARS = 160;

export function renderSkillCatalog(registry: SkillRegistry): string {
  const lines = [...registry.skills]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((skill) => `- ${skill.name}: ${flatten(skill.description).slice(0, MAX_DESCRIPTION_CHARS)}`);
  return capLines(lines, MAX_CATALOG_BYTES);
}
