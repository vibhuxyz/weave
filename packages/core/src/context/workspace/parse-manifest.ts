import type { PackageManifest } from "./types.ts";

type Json = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

function firstExportTarget(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return null;
  for (const key of ["import", "default", "types", "require"]) {
    const target = firstExportTarget(value[key]);
    if (target) return target;
  }
  return null;
}

function exportsMapOf(value: unknown): Record<string, string> {
  if (typeof value === "string") return { ".": value };
  if (!isRecord(value)) return {};
  const entries = Object.entries(value).filter(([key]) => key.startsWith("."));
  if (entries.length === 0) {
    const target = firstExportTarget(value);
    return target ? { ".": target } : {};
  }
  return Object.fromEntries(entries.flatMap(([key, target]) => {
    const resolved = firstExportTarget(target);
    return resolved ? [[key, resolved]] : [];
  }));
}

function workspaceGlobsOf(value: unknown): readonly string[] {
  const list = Array.isArray(value) ? value : isRecord(value) && Array.isArray(value.packages) ? value.packages : [];
  return list.filter((entry): entry is string => typeof entry === "string");
}

export function parseManifest(dir: string, text: string): PackageManifest | null {
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed)) return null;
  const dependencies = [parsed.dependencies, parsed.devDependencies, parsed.peerDependencies].flatMap((group) => Object.keys(stringRecord(group)));
  const entryFields = ["main", "module", "types"].flatMap((key) => (typeof parsed[key] === "string" ? [parsed[key] as string] : []));
  return {
    dir,
    name: typeof parsed.name === "string" ? parsed.name : null,
    scripts: stringRecord(parsed.scripts),
    dependencies: [...new Set(dependencies)].sort(),
    entryFields,
    exportsMap: exportsMapOf(parsed.exports),
    hasBin: parsed.bin !== undefined,
    workspaceGlobs: workspaceGlobsOf(parsed.workspaces),
  };
}
