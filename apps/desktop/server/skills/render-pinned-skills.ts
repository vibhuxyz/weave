import {
  MAX_PINNED_SKILLS_BYTES,
  MAX_PINNED_SKILL_BYTES,
  PINNED_SKILLS_INTRO,
} from "./constants.ts";
import type { PinnedSkill, PinnedSkillsLoad, SkippedSkill } from "./types.ts";

const CLOSING_TAGS = ["</pinned-skill>", "</pinned-skills>"] as const;

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function escapeClosingTags(body: string): string {
  return CLOSING_TAGS.reduce((text, tag) => text.replaceAll(tag, tag.replace("</", "<\\/")), body);
}

function flatten(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function entryOf(skill: PinnedSkill): string {
  const source = skill.sourcePath === null ? "" : ` source="${flatten(skill.sourcePath)}"`;
  return `<pinned-skill name="${flatten(skill.name)}"${source}>\n${escapeClosingTags(skill.body.trim())}\n</pinned-skill>`;
}

function pointerOf(skill: PinnedSkill): string {
  return `- ${flatten(skill.name)}: read ${skill.sourcePath ?? "its SKILL.md"} before starting`;
}

export function renderPinnedSkills({ loaded, skipped }: PinnedSkillsLoad): string {
  const sorted = [...loaded].sort((a, b) => a.name.localeCompare(b.name));
  const inlined: string[] = [];
  const pointers: string[] = [];
  const notInlined: SkippedSkill[] = [...skipped];
  let usedBytes = 0;
  for (const skill of sorted) {
    const entry = entryOf(skill);
    const size = byteLength(entry);
    const fits = size <= MAX_PINNED_SKILL_BYTES && usedBytes + size <= MAX_PINNED_SKILLS_BYTES;
    if (fits) {
      inlined.push(entry);
      usedBytes += size;
      continue;
    }
    pointers.push(pointerOf(skill));
    notInlined.push({ name: skill.name, reason: `${size} bytes over the pinned-skill budget` });
  }
  if (inlined.length === 0 && pointers.length === 0 && notInlined.length === 0) return "";
  const notes = notInlined.map((item) => `- ${flatten(item.name)}: ${flatten(item.reason)}`);
  return [
    "<pinned-skills>",
    PINNED_SKILLS_INTRO,
    ...inlined,
    ...(pointers.length > 0 ? ["Read these skills from their files:", ...pointers] : []),
    ...(notes.length > 0 ? ["Not inlined:", ...notes] : []),
    "</pinned-skills>",
  ].join("\n\n");
}
