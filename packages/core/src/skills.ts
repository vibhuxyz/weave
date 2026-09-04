import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * A skill is a folder with a `SKILL.md` whose YAML frontmatter names it and
 * says when it applies. Skills are a property of the repo, not the app, so
 * they live inside the project:
 *
 *   <project>/.weave/skills/<slug>/SKILL.md
 *   <project>/.agents/skills/<slug>/SKILL.md
 *
 * Discovery is a filesystem scan. The body of `SKILL.md` is never read here —
 * the agent reads it on demand once the catalog entry matches its task.
 */
export interface SkillEntry {
  name: string;
  description: string;
  /** Absolute path to the SKILL.md the agent should read. */
  sourcePath: string;
  /** Path globs this skill is scoped to, if the frontmatter declares any. */
  appliesTo?: string[];
}

const SKILL_DIRS = [".weave/skills", ".agents/skills"];

/**
 * Pull the `---` fenced frontmatter off the top of a file. Returns the raw
 * block text, or null when there is no frontmatter.
 */
function frontmatter(text: string): string | null {
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) return null;
  const end = text.indexOf("\n---", 3);
  if (end === -1) return null;
  return text.slice(text.indexOf("\n") + 1, end);
}

/**
 * A deliberately small YAML reader: `key: value` scalars and inline / block
 * lists. SKILL.md frontmatter is flat and hand-written, so a full parser would
 * be a dependency we do not need.
 */
function parseFrontmatter(block: string): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  const lines = block.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1];
    const value = m[2].trim();

    if (value === "" || value === "[]") {
      // A block list follows: subsequent `  - item` lines.
      const items: string[] = [];
      while (i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1])) {
        items.push(lines[++i].replace(/^\s*-\s+/, "").trim().replace(/^["']|["']$/g, ""));
      }
      out[key] = items;
      continue;
    }
    if (value.startsWith("[") && value.endsWith("]")) {
      out[key] = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
      continue;
    }
    out[key] = value.replace(/^["']|["']$/g, "");
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
  } catch {
    return null;
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
    appliesTo: asArray((fm["applies-to"] ?? fm.appliesTo) as string | string[]),
  };
}

/**
 * Scan a project for skills. Missing skill directories are not an error —
 * most projects have none.
 */
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
    } catch {
      continue;
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

/**
 * The `<available-skills>` block for the system prompt: a pointer list, never
 * skill content. The agent reads a `SKILL.md` from `Source` only when its
 * description matches the task in front of it.
 *
 * Returns "" for an empty catalog — never an empty block.
 */
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
