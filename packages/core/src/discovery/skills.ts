import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { isNotFound } from "../shared/index.ts";

export interface SkillEntry {
  name: string;
  description: string;
  sourcePath: string;
  appliesTo?: string[];
}

const SKILL_DIRS = [".weave/skills", ".agents/skills"];
const FRONTMATTER_LINE_PATTERN = /^([A-Za-z0-9_-]+):\s*(.*)$/;
const LIST_ITEM_PATTERN = /^\s*-\s+/;
const QUOTED_VALUE_PATTERN = /^["']|["']$/g;

function frontmatter(text: string): string | null {
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) return null;
  const end = text.indexOf("\n---", 3);
  if (end === -1) return null;
  return text.slice(text.indexOf("\n") + 1, end);
}

function parseFrontmatter(block: string): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  const lines = block.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const m = FRONTMATTER_LINE_PATTERN.exec(line);
    if (!m) continue;
    const key = m[1];
    const rawValue = m[2];
    if (key === undefined || rawValue === undefined) continue;
    const value = rawValue.trim();

    if (value === "" || value === "[]") {
      const items: string[] = [];
      while (i + 1 < lines.length) {
        const next = lines[i + 1];
        if (next === undefined || !LIST_ITEM_PATTERN.test(next)) break;
        i++;
        items.push(next.replace(LIST_ITEM_PATTERN, "").trim().replace(QUOTED_VALUE_PATTERN, ""));
      }
      out[key] = items;
      continue;
    }
    if (value.startsWith("[") && value.endsWith("]")) {
      out[key] = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(QUOTED_VALUE_PATTERN, ""))
        .filter(Boolean);
      continue;
    }
    out[key] = value.replace(QUOTED_VALUE_PATTERN, "");
  }
  return out;
}

function asArray(v: string | string[] | undefined): string[] | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v : [v];
}

async function readSkill(dir: string): Promise<SkillEntry | null> {
  const sourcePath = join(dir, "SKILL.md");
  let text: string;
  try {
    text = await readFile(sourcePath, "utf8");
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
  const block = frontmatter(text);
  if (!block) return null;
  const fm = parseFrontmatter(block);
  const name = typeof fm.name === "string" ? fm.name : "";
  const description = typeof fm.description === "string" ? fm.description : "";
  if (!name || !description) {
    console.warn(`[skills] ${sourcePath}: missing name or description, skipped`);
    return null;
  }
  return {
    name,
    description,
    sourcePath,
    appliesTo: asArray((fm["applies-to"] ?? fm.appliesTo) as string | string[] | undefined),
  };
}

export async function discoverSkills(projectRoot: string): Promise<SkillEntry[]> {
  const found: SkillEntry[] = [];
  const seen = new Set<string>();
  for (const rel of SKILL_DIRS) {
    const base = join(projectRoot, rel);
    let slugs: string[];
    try {
      slugs = (await readdir(base, { withFileTypes: true }))
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
    } catch (error) {
      if (isNotFound(error)) continue;
      throw error;
    }
    for (const slug of slugs) {
      const entry = await readSkill(join(base, slug));
      if (entry && !seen.has(entry.name)) {
        seen.add(entry.name);
        found.push(entry);
      }
    }
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

export function formatSkillCatalog(entries: SkillEntry[]): string {
  if (entries.length === 0) return "";
  const body = entries
    .map((s) => {
      const lines = [`- ${s.name}: ${s.description}`, `  Source: ${s.sourcePath}`];
      if (s.appliesTo?.length) lines.push(`  Applies to: ${s.appliesTo.join(", ")}`);
      return lines.join("\n");
    })
    .join("\n");
  return [
    "<available-skills>",
    "Skills are step-by-step guides for specific tasks. When a skill's",
    "description matches what you are about to do, read its SKILL.md from the",
    "Source path before starting.",
    "",
    body,
    "</available-skills>",
  ].join("\n");
}
