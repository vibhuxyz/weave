import { ADAPTER_EXTENSIONS } from "../languages/index.ts";

const MAX_SUFFIX_SEGMENTS = 4;
const MAX_PATHS_PER_KEY = 8;
const PACKAGE_ENTRY_NAMES: readonly string[] = ["__init__", "mod", "index", "lib", "main"];

export type ModulePathIndex = ReadonlyMap<string, readonly string[]>;

function withoutExtension(path: string): string | null {
  const extension = ADAPTER_EXTENSIONS.find((candidate) => path.toLowerCase().endsWith(candidate));
  if (!extension) return null;
  const base = path.slice(0, -extension.length);
  const segments = base.split("/");
  const last = segments.at(-1) ?? "";
  return PACKAGE_ENTRY_NAMES.includes(last) && segments.length > 1 ? segments.slice(0, -1).join("/") : base;
}

function suffixesOf(base: string): readonly string[] {
  const segments = base.split("/").filter((segment) => segment.length > 0);
  const suffixes: string[] = [];
  for (let count = 1; count <= Math.min(MAX_SUFFIX_SEGMENTS, segments.length); count += 1) {
    suffixes.push(segments.slice(segments.length - count).join("/"));
  }
  return suffixes;
}

function add(index: Map<string, string[]>, key: string, path: string): void {
  const paths = index.get(key) ?? [];
  if (paths.length < MAX_PATHS_PER_KEY) paths.push(path);
  index.set(key, paths);
}

export function buildModulePathIndex(files: Iterable<string>): ModulePathIndex {
  const byModule = new Map<string, string[]>();
  const byDirectory = new Map<string, string[]>();
  for (const path of files) {
    const base = withoutExtension(path);
    if (base === null) continue;
    for (const suffix of suffixesOf(base)) add(byModule, suffix, path);
    const directory = path.split("/").slice(0, -1).join("/");
    if (directory.length > 0) for (const suffix of suffixesOf(directory)) add(byDirectory, suffix, path);
  }

  const index = new Map<string, string[]>();
  for (const [key, paths] of [...byModule, ...byDirectory]) {
    const merged = index.get(key) ?? [];
    index.set(key, [...new Set([...merged, ...paths])].sort());
  }
  return index;
}
