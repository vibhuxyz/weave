import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { isNotFound, mapBounded } from "../../shared/index.ts";
import { PARSE_CONCURRENCY } from "../constants.ts";
import type { ProjectFile, Skipped } from "../types.ts";
import { kindOf } from "./classify-file.ts";
import { listProjectPaths } from "./list-paths.ts";

export interface ScanResult {
  readonly files: readonly Omit<ProjectFile, "workspace" | "hash">[];
  readonly skipped: readonly Skipped[];
  readonly source: "git" | "walk";
}

type Stat = { readonly path: string; readonly bytes: number } | { readonly path: string; readonly reason: string };

async function statFile(root: string, path: string): Promise<Stat> {
  const info = await lstat(join(root, path)).catch((error: unknown) => {
    if (isNotFound(error)) return null;
    throw error;
  });
  if (!info) return { path, reason: "listed but no longer on disk" };
  if (info.isSymbolicLink()) return { path, reason: "symbolic link, not followed" };
  if (!info.isFile()) return { path, reason: "not a regular file" };
  return { path, bytes: info.size };
}

export async function scanProject(root: string, isGitRepo: boolean): Promise<ScanResult> {
  const listing = await listProjectPaths(root, isGitRepo);
  const stats = await mapBounded(listing.paths, PARSE_CONCURRENCY, (path) => statFile(root, path));
  const files = stats.flatMap((stat) => ("bytes" in stat ? [{ path: stat.path, bytes: stat.bytes, kind: kindOf(stat.path) }] : []));
  const skipped = stats.flatMap((stat) => ("reason" in stat ? [{ path: stat.path, reason: stat.reason }] : []));
  return { files, skipped: [...listing.skipped, ...skipped], source: listing.source };
}
