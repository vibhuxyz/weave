import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isNotFound, mapBounded } from "../shared/index.ts";
import { parseModule } from "./ast/index.ts";
import { contentHash, type CachedModule, type ModuleCache } from "./cache/index.ts";
import { MAX_PARSED_FILE_BYTES, PARSE_CONCURRENCY } from "./constants.ts";
import { isParsableSource } from "./scan/index.ts";
import type { ModuleFacts, ProjectFile, Skipped } from "./types.ts";

export interface ParsedSources {
  readonly modules: readonly ModuleFacts[];
  readonly cache: ModuleCache;
  readonly skipped: readonly Skipped[];
  readonly reused: number;
}

type Outcome = { readonly path: string; readonly entry: CachedModule; readonly isReused: boolean } | Skipped;

async function parseOne(root: string, file: ProjectFile, cache: ModuleCache): Promise<Outcome> {
  if (file.bytes > MAX_PARSED_FILE_BYTES) return { path: file.path, reason: `larger than ${MAX_PARSED_FILE_BYTES} bytes, not parsed` };
  const text = await readFile(join(root, file.path), "utf8").catch((error: unknown) => {
    if (isNotFound(error)) return null;
    throw error;
  });
  if (text === null) return { path: file.path, reason: "removed while the project was being scanned" };
  const hash = contentHash(text);
  const cached = cache.get(file.path);
  if (cached?.hash === hash) return { path: file.path, entry: cached, isReused: true };
  return { path: file.path, entry: { hash, facts: parseModule(file.path, text) }, isReused: false };
}

export async function parseSources(root: string, files: readonly ProjectFile[], cache: ModuleCache): Promise<ParsedSources> {
  const sources = files.filter((file) => (file.kind === "source" || file.kind === "test") && isParsableSource(file.path));
  const outcomes = await mapBounded(sources, PARSE_CONCURRENCY, (file) => parseOne(root, file, cache));
  const parsed = outcomes.filter((outcome): outcome is Exclude<Outcome, Skipped> => "entry" in outcome);
  return {
    modules: parsed.map((outcome) => outcome.entry.facts),
    cache: new Map(parsed.map((outcome) => [outcome.path, outcome.entry])),
    skipped: outcomes.filter((outcome): outcome is Skipped => "reason" in outcome),
    reused: parsed.filter((outcome) => outcome.isReused).length,
  };
}
