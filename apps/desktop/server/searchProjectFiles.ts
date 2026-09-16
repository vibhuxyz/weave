import { readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";
import {
  DEFAULT_FILE_SEARCH_LIMIT,
  FILE_SEARCH_IGNORE,
  FILE_SEARCH_MAX_DEPTH,
} from "./server.constants.ts";

interface FileHit {
  readonly path: string;
  readonly rank: number;
}

export async function searchProjectFiles(
  root: string,
  query: string,
  limit = DEFAULT_FILE_SEARCH_LIMIT,
): Promise<string[]> {
  const needle = query.toLowerCase();
  const hits: FileHit[] = [];

  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > FILE_SEARCH_MAX_DEPTH || hits.length >= limit * 4) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (FILE_SEARCH_IGNORE.has(entry.name)) continue;
      const abs = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith(".")) continue;
        await walk(abs, depth + 1);
      } else if (entry.isFile()) {
        const rel = relative(root, abs);
        const lower = rel.toLowerCase();
        if (!needle || lower.includes(needle)) {
          hits.push({
            path: rel,
            rank: entry.name.toLowerCase().includes(needle) ? 0 : 1,
          });
        }
      }
    }
  };

  await walk(root, 0);
  return hits
    .sort((a, b) => a.rank - b.rank || a.path.length - b.path.length)
    .slice(0, limit)
    .map((h) => h.path);
}
