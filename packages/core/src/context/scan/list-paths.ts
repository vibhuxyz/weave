import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { runGit } from "../../worktree/index.ts";
import type { Skipped } from "../types.ts";
import { MAX_SCANNED_FILES } from "../constants.ts";
import { isIgnoredPath } from "./classify-file.ts";

export interface PathListing {
  readonly paths: readonly string[];
  readonly source: "git" | "walk";
  readonly skipped: readonly Skipped[];
}

function capped(paths: readonly string[], source: PathListing["source"]): PathListing {
  const kept = [...new Set(paths.filter((path) => !isIgnoredPath(path)))].sort();
  const skipped = kept.length > MAX_SCANNED_FILES ? [{ path: ".", reason: `only the first ${MAX_SCANNED_FILES} of ${kept.length} files were scanned` }] : [];
  return { paths: kept.slice(0, MAX_SCANNED_FILES), source, skipped };
}

async function listGitPaths(root: string): Promise<readonly string[] | null> {
  const listed = await runGit(root, ["-c", "core.quotepath=off", "ls-files", "--cached", "--others", "--exclude-standard"]);
  if (!listed.ok) return null;
  return listed.output.split(/\r?\n/).filter((line) => line.length > 0);
}

async function walk(root: string, dir: string, found: string[], skipped: Skipped[]): Promise<void> {
  if (found.length > MAX_SCANNED_FILES) return;
  const entries = (await readdir(join(root, dir), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const path = dir ? `${dir}/${entry.name}` : entry.name;
    if (isIgnoredPath(path)) continue;
    if (entry.isSymbolicLink()) skipped.push({ path, reason: "symbolic link, not followed" });
    else if (entry.isDirectory()) await walk(root, path, found, skipped);
    else if (entry.isFile()) found.push(path);
  }
}

export async function listProjectPaths(root: string, isGitRepo: boolean): Promise<PathListing> {
  const gitPaths = isGitRepo ? await listGitPaths(root) : null;
  if (gitPaths) return capped(gitPaths, "git");
  const found: string[] = [];
  const skipped: Skipped[] = [];
  await walk(root, "", found, skipped);
  const listing = capped(found, "walk");
  return { ...listing, skipped: [...skipped, ...listing.skipped] };
}
