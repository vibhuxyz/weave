import { readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";
import type { Dirent } from "node:fs";
import {
  DEFAULT_FILE_SEARCH_LIMIT,
  FILE_SEARCH_IGNORE,
  FILE_SEARCH_MAX_DEPTH,
} from "../shared/index.ts";

interface FileHit {
  readonly path: string;
  readonly rank: number;
}

function isExpectedSearchError(error: unknown): boolean {
  if (!(error instanceof Error) || !("code" in error)) return false;
  const code = (error as { code: unknown }).code;
  return code === "ENOENT" || code === "ENOTDIR" || code === "EACCES" || code === "EPERM";
}

async function readDirectoryEntries(dir: string): Promise<readonly Dirent[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return [...entries].sort((a, b) => a.name.localeCompare(b.name));
  } catch (error: unknown) {
    if (isExpectedSearchError(error)) return [];
    throw error;
  }
}

async function collectFiles(
  root: string,
  dir: string,
  depth: number,
  needle: string,
  hits: FileHit[],
  maxHits: number,
): Promise<void> {
  if (depth > FILE_SEARCH_MAX_DEPTH || hits.length >= maxHits) return;

  const entries = await readDirectoryEntries(dir);
  for (const entry of entries) {
    if (FILE_SEARCH_IGNORE.has(entry.name)) continue;
    const abs = resolve(dir, entry.name);

    if (entry.isDirectory()) {
      if (!entry.name.startsWith(".")) {
        await collectFiles(root, abs, depth + 1, needle, hits, maxHits);
      }
    } else if (entry.isFile()) {
      const rel = relative(root, abs);
      const lower = rel.toLowerCase();
      if (!needle || lower.includes(needle)) {
        const rank = entry.name.toLowerCase().includes(needle) ? 0 : 1;
        hits.push({ path: rel, rank });
      }
    }
  }
}

export async function searchProjectFiles(
  root: string,
  query: string,
  limit = DEFAULT_FILE_SEARCH_LIMIT,
): Promise<string[]> {
  const needle = query.toLowerCase();
  const hits: FileHit[] = [];
  const maxScanHits = limit * 4;

  await collectFiles(root, root, 0, needle, hits, maxScanHits);

  return hits
    .sort((a, b) => a.rank - b.rank || a.path.length - b.path.length || a.path.localeCompare(b.path))
    .slice(0, limit)
    .map((h) => h.path);
}
