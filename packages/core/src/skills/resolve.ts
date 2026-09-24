import { wordsOf } from "../context/index.ts";
import type { RegisteredSkill, ResolvedSkill, SkillQuery } from "./types.ts";

const STACK_WEIGHT = 3;
const LAYER_WEIGHT = 2;
const KEYWORD_WEIGHT = 2;
const PATH_WEIGHT = 3;
const MIN_SCORE = 3;
const DEFAULT_LIMIT = 5;

function globRegex(glob: string): RegExp {
  const body = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*\/?/g, "\u0000").replace(/\*/g, "[^/]*").replaceAll("\u0000", ".*");
  return new RegExp(`^${body}$`);
}

function overlap(wanted: readonly string[] | undefined, have: ReadonlySet<string>): readonly string[] {
  return (wanted ?? []).filter((value) => have.has(value.toLowerCase()));
}

function scoreSkill(skill: RegisteredSkill, query: SkillQuery, words: ReadonlySet<string>): ResolvedSkill {
  const triggers = skill.triggers;
  const reasons: string[] = [];
  let score = 0;
  const add = (matched: readonly string[], weight: number, label: string) => {
    if (matched.length === 0) return;
    score += weight * matched.length;
    reasons.push(`${label} ${matched.join(", ")}`);
  };
  add(overlap(triggers.languages, new Set(query.languages.map((value) => value.toLowerCase()))), STACK_WEIGHT, "language");
  add(overlap(triggers.frameworks, new Set(query.frameworks.map((value) => value.toLowerCase()))), STACK_WEIGHT, "framework");
  add(overlap(triggers.packages, new Set(query.packages.map((value) => value.toLowerCase()))), STACK_WEIGHT, "package");
  add(overlap(triggers.layers, new Set(query.layers)), LAYER_WEIGHT, "layer");
  add((triggers.keywords ?? []).filter((keyword) => words.has(keyword)), KEYWORD_WEIGHT, "mentions");
  const pathHits = (triggers.paths ?? []).filter((glob) => query.paths.some((path) => globRegex(glob).test(path)));
  add(pathHits, PATH_WEIGHT, "paths");
  return { skill, score, reasons };
}

export function resolveSkills(skills: readonly RegisteredSkill[], query: SkillQuery, limit = DEFAULT_LIMIT): readonly ResolvedSkill[] {
  const words = new Set([...wordsOf(query.text), ...query.text.toLowerCase().split(/[^a-z0-9]+/)]);
  const matched = skills.map((skill) => scoreSkill(skill, query, words)).filter((resolved) => resolved.score >= MIN_SCORE);
  const refined = new Set(matched.flatMap((resolved) => resolved.skill.triggers.refines ?? []));
  return matched
    .filter((resolved) => !refined.has(resolved.skill.name))
    .sort((a, b) => b.score - a.score || a.skill.id.localeCompare(b.skill.id))
    .slice(0, limit);
}
