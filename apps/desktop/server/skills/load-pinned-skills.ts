import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative } from "node:path";
import { isNotFound, type RegisteredSkill, type SkillEntry } from "@weave/core";
import { MAX_SKILL_FILE_BYTES } from "./constants.ts";
import type { PinnedSkill, PinnedSkillsLoad, SkippedSkill } from "./types.ts";

const FRONTMATTER_PATTERN = /^---\r?\n(?:[\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/;

export interface PinnedSkillSources {
  readonly projectSkills: readonly SkillEntry[];
  readonly builtinSkills: readonly RegisteredSkill[];
  readonly skillRoots: readonly string[];
}

type Resolved = { readonly skill: PinnedSkill } | { readonly skipped: SkippedSkill };

function isInside(root: string, target: string): boolean {
  const path = relative(root, target);
  return path !== "" && !path.startsWith("..") && !isAbsolute(path);
}

async function realRoots(skillRoots: readonly string[]): Promise<readonly string[]> {
  const roots = await Promise.all(
    skillRoots.map((root) => realpath(root).catch((error: unknown) => {
      if (isNotFound(error)) return null;
      throw error;
    })),
  );
  return roots.filter((root): root is string => root !== null);
}

async function readProjectSkill(entry: SkillEntry, roots: readonly string[]): Promise<Resolved> {
  const missing = { skipped: { name: entry.name, reason: `Cannot read skill file ${entry.sourcePath}` } };
  try {
    const target = await realpath(entry.sourcePath);
    if (!roots.some((root) => isInside(root, target))) {
      return { skipped: { name: entry.name, reason: `Skill file ${entry.sourcePath} is outside the skill folders` } };
    }
    if ((await stat(target)).size > MAX_SKILL_FILE_BYTES) {
      return { skipped: { name: entry.name, reason: `Skill file ${entry.sourcePath} is over ${MAX_SKILL_FILE_BYTES} bytes` } };
    }
    const text = await readFile(target, "utf8");
    return { skill: { name: entry.name, sourcePath: entry.sourcePath, body: text.replace(FRONTMATTER_PATTERN, "") } };
  } catch (error) {
    if (isNotFound(error)) return missing;
    throw error;
  }
}

function resolveOne(name: string, sources: PinnedSkillSources, roots: readonly string[]): Promise<Resolved> {
  const project = sources.projectSkills.find((entry) => entry.name === name);
  if (project) return readProjectSkill(project, roots);
  const builtin = sources.builtinSkills.find((skill) => skill.name === name && skill.body !== null);
  if (builtin?.body) return Promise.resolve({ skill: { name, sourcePath: null, body: builtin.body } });
  return Promise.resolve({ skipped: { name, reason: "No skill with this name was found" } });
}

export async function loadPinnedSkills(names: readonly string[], sources: PinnedSkillSources): Promise<PinnedSkillsLoad> {
  if (names.length === 0) return { loaded: [], skipped: [] };
  const roots = await realRoots(sources.skillRoots);
  const results = await Promise.all(names.map((name) => resolveOne(name, sources, roots)));
  return {
    loaded: results.flatMap((result) => ("skill" in result ? [result.skill] : [])),
    skipped: results.flatMap((result) => ("skipped" in result ? [result.skipped] : [])),
  };
}
