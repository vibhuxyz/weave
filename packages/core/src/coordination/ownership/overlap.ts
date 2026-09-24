import type { ResourceKind, ResourceRef } from "@weave/protocol";

const PATH_KINDS: ReadonlySet<ResourceKind> = new Set(["file", "directory", "module"]);
const SYMBOL_SEPARATOR = "#";

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^(?:\.\/)+/, "").replace(/\/+$/, "");
}

export function normalizeResource(resource: ResourceRef): ResourceRef {
  const trimmed = resource.id.replace(/\s+/g, " ").trim();
  if (PATH_KINDS.has(resource.kind)) return { kind: resource.kind, id: normalizePath(trimmed) };
  if (resource.kind !== "symbol") return { kind: resource.kind, id: trimmed };
  const [path = "", name = ""] = trimmed.split(SYMBOL_SEPARATOR, 2);
  return { kind: "symbol", id: `${normalizePath(path)}${SYMBOL_SEPARATOR}${name}` };
}

function pathContains(outer: string, inner: string): boolean {
  return outer === "" || outer === inner || inner.startsWith(`${outer}/`);
}

function pathsOverlap(a: string, b: string): boolean {
  return pathContains(a, b) || pathContains(b, a);
}

function symbolFile(symbolId: string): string {
  return symbolId.split(SYMBOL_SEPARATOR, 1)[0] ?? "";
}

export function describeResource(resource: ResourceRef): string {
  return `${resource.kind} ${resource.id === "" ? "(whole project)" : resource.id}`;
}

export function resourcesOverlap(a: ResourceRef, b: ResourceRef): boolean {
  const isPathA = PATH_KINDS.has(a.kind);
  const isPathB = PATH_KINDS.has(b.kind);
  if (isPathA && isPathB) return pathsOverlap(a.id, b.id);
  if (isPathA && b.kind === "symbol") return pathContains(a.id, symbolFile(b.id));
  if (isPathB && a.kind === "symbol") return pathContains(b.id, symbolFile(a.id));
  return a.kind === b.kind && a.id === b.id;
}
