import { readdir, readFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { isNotFound } from "../shared/index.ts";

export interface RuleEntry {
  name: string;
  body: string;
  sourcePath: string;
}

const FRONTMATTER_NAME_PATTERN = /^name:\s*(.+)$/m;
const QUOTED_VALUE_PATTERN = /^["']|["']$/g;

function parseRule(text: string): { name?: string; body: string } {
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) {
    return { body: text.trim() };
  }
  const end = text.indexOf("\n---", 3);
  if (end === -1) return { body: text.trim() };

  const block = text.slice(text.indexOf("\n") + 1, end);
  const rest = text.slice(end + 4).replace(/^\r?\n/, "");
  const match = FRONTMATTER_NAME_PATTERN.exec(block);
  const name = match?.[1]?.trim().replace(QUOTED_VALUE_PATTERN, "");
  return { name, body: rest.trim() };
}

async function readRule(path: string): Promise<RuleEntry | null> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
  const { name: fmName, body } = parseRule(text);
  if (!body) return null;
  return {
    name: fmName || basename(path, extname(path)),
    body,
    sourcePath: path,
  };
}

export async function discoverRules(ruleDirs: readonly string[]): Promise<RuleEntry[]> {
  const found: RuleEntry[] = [];
  const seen = new Set<string>();
  for (const dir of ruleDirs) {
    let files: string[];
    try {
      files = (await readdir(dir, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
        .map((entry) => entry.name)
        .sort();
    } catch (error) {
      if (isNotFound(error)) continue;
      throw error;
    }
    for (const file of files) {
      const entry = await readRule(join(dir, file));
      if (entry && !seen.has(entry.name)) {
        seen.add(entry.name);
        found.push(entry);
      }
    }
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

export function formatRulesBlock(entries: RuleEntry[]): string {
  if (entries.length === 0) return "";
  const body = entries.map((r) => `## ${r.name}\n${r.body}`).join("\n\n");
  return [
    "<project-rules>",
    "These are standing constraints for this project. Follow them on every",
    "turn, not just when they seem relevant.",
    "",
    body,
    "</project-rules>",
  ].join("\n");
}
