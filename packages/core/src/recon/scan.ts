import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { isNotFound, mapBounded } from "../shared/index.ts";
import {
  IGNORED_DIRECTORIES,
  MANIFEST_BY_EXTENSION,
  MANIFEST_BY_FILENAME,
  MAX_MANIFEST_BYTES,
  MAX_MANIFEST_READS,
  MAX_SCAN_DEPTH,
  MAX_SCANNED_FILES,
} from "./constants.ts";
import type { ManifestFile, ManifestKind, RepositoryScan, ScannedFile, Skipped } from "./types.ts";

interface ScanLimits {
  readonly maxFiles: number;
  readonly maxDepth: number;
  readonly signal: AbortSignal | undefined;
}

interface Collector {
  readonly files: ScannedFile[];
  readonly directories: string[];
  readonly skipped: Skipped[];
  truncated: boolean;
}

const ignored = new Set(IGNORED_DIRECTORIES);

function toPosix(path: string): string {
  return sep === "/" ? path : path.split(sep).join("/");
}

export function manifestKindOf(fileName: string): ManifestKind | null {
  const byName = MANIFEST_BY_FILENAME.get(fileName);
  if (byName) return byName;
  const dot = fileName.lastIndexOf(".");
  if (dot < 0) return null;
  return MANIFEST_BY_EXTENSION.get(fileName.slice(dot)) ?? null;
}

type DirEntry = { name: string; isDirectory(): boolean; isFile(): boolean };

async function readEntries(root: string, dir: string, into: Collector): Promise<DirEntry[] | null> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    if (!isNotFound(error)) throw error;
    into.skipped.push({ path: toPosix(relative(root, dir)), reason: "unreadable directory" });
    return null;
  }
}

async function visit(
  root: string,
  entry: DirEntry,
  absolute: string,
  depth: number,
  limits: ScanLimits,
  into: Collector,
): Promise<void> {
  const relativePath = toPosix(relative(root, absolute));

  if (entry.isDirectory()) {
    if (ignored.has(entry.name)) {
      into.skipped.push({ path: relativePath, reason: "ignored directory" });
      return;
    }
    into.directories.push(relativePath);
    await walk(root, absolute, depth + 1, limits, into);
    return;
  }

  if (!entry.isFile()) {
    into.skipped.push({ path: relativePath, reason: "not a regular file" });
    return;
  }

  if (into.files.length >= limits.maxFiles) {
    into.truncated = true;
    into.skipped.push({ path: relativePath, reason: `more than ${limits.maxFiles} files` });
    return;
  }

  const bytes = await fileBytes(absolute);
  if (bytes === null) {
    into.skipped.push({ path: relativePath, reason: "unreadable file" });
    return;
  }
  into.files.push({ path: relativePath, bytes });
}

async function walk(root: string, dir: string, depth: number, limits: ScanLimits, into: Collector): Promise<void> {
  if (limits.signal?.aborted || into.truncated) return;
  if (depth > limits.maxDepth) {
    into.skipped.push({ path: toPosix(relative(root, dir)), reason: `deeper than ${limits.maxDepth} levels` });
    return;
  }

  const entries = await readEntries(root, dir, into);
  if (!entries) return;

  for (const entry of entries) {
    if (into.truncated || limits.signal?.aborted) return;
    await visit(root, entry, join(dir, entry.name), depth, limits, into);
  }
}

async function fileBytes(path: string): Promise<number | null> {
  try {
    return (await stat(path)).size;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export async function scanRepository(
  root: string,
  limits: { maxFiles: number; maxDepth: number; signal?: AbortSignal },
): Promise<RepositoryScan> {
  const into: Collector = { files: [], directories: [], skipped: [], truncated: false };
  await walk(root, root, 0, { maxFiles: limits.maxFiles, maxDepth: limits.maxDepth, signal: limits.signal }, into);
  return {
    root,
    files: into.files,
    directories: into.directories.sort(),
    truncated: into.truncated,
    skipped: into.skipped.sort((a, b) => a.path.localeCompare(b.path)),
  };
}

export async function readManifests(
  scan: RepositoryScan,
  maxBytes: number,
): Promise<{ manifests: ManifestFile[]; skipped: Skipped[] }> {
  const candidates = scan.files
    .map((file) => ({ file, kind: manifestKindOf(file.path.split("/").at(-1) ?? "") }))
    .filter((entry): entry is { file: ScannedFile; kind: ManifestKind } => entry.kind !== null);

  const skipped: Skipped[] = [];
  const readable = candidates.filter((entry) => {
    if (entry.file.bytes <= maxBytes) return true;
    skipped.push({ path: entry.file.path, reason: `manifest larger than ${maxBytes} bytes` });
    return false;
  });

  const texts = await mapBounded(readable, MAX_MANIFEST_READS, (entry) =>
    readText(join(scan.root, entry.file.path)),
  );
  const manifests: ManifestFile[] = [];
  readable.forEach((entry, index) => {
    const text = texts[index];
    if (text === null || text === undefined) {
      skipped.push({ path: entry.file.path, reason: "unreadable manifest" });
      return;
    }
    manifests.push({ path: entry.file.path, kind: entry.kind, text });
  });

  return {
    manifests: manifests.sort((a, b) => a.path.localeCompare(b.path)),
    skipped: skipped.sort((a, b) => a.path.localeCompare(b.path)),
  };
}

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export const DEFAULT_SCAN_LIMITS = {
  maxFiles: MAX_SCANNED_FILES,
  maxDepth: MAX_SCAN_DEPTH,
  maxManifestBytes: MAX_MANIFEST_BYTES,
} as const;
