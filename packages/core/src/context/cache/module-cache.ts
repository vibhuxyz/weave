import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { isNotFound } from "../../shared/index.ts";
import type { ModuleFacts } from "../types.ts";

const CACHE_VERSION = 2;

export interface CachedModule {
  readonly hash: string;
  readonly facts: ModuleFacts;
}

export type ModuleCache = ReadonlyMap<string, CachedModule>;

export function contentHash(text: string): string {
  return createHash("sha1").update(text).digest("hex");
}

function isCacheFile(value: unknown): value is { readonly version: number; readonly modules: Record<string, CachedModule> } {
  return typeof value === "object" && value !== null && "version" in value && "modules" in value && typeof value.modules === "object" && value.modules !== null;
}

export async function loadModuleCache(path: string): Promise<ModuleCache> {
  const text = await readFile(path, "utf8").catch((error: unknown) => {
    if (isNotFound(error)) return null;
    throw error;
  });
  if (text === null) return new Map();
  const parsed: unknown = (() => {
    try {
      return JSON.parse(text);
    } catch (error: unknown) {
      if (error instanceof SyntaxError) return null;
      throw error;
    }
  })();
  if (!isCacheFile(parsed) || parsed.version !== CACHE_VERSION) return new Map();
  return new Map(Object.entries(parsed.modules));
}

export async function saveModuleCache(path: string, modules: ModuleCache): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const sorted = Object.fromEntries([...modules].sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(path, JSON.stringify({ version: CACHE_VERSION, modules: sorted }));
}
