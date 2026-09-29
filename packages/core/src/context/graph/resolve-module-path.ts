import { posix } from "node:path";
import type { ModulePathIndex } from "./module-index.ts";

const MAX_SUFFIX_SEGMENTS = 4;
const SEPARATORS = /::|\./g;

function relativeSegments(from: string, specifier: string): string | null {
  const dots = /^\.+/.exec(specifier)?.[0].length ?? 0;
  if (dots === 0) return null;
  const rest = specifier.slice(dots).replace(SEPARATORS, "/");
  const up = "../".repeat(Math.max(0, dots - 1));
  return posix.normalize(posix.join(posix.dirname(from), up, rest));
}

function normalize(specifier: string): string {
  return specifier
    .replace(SEPARATORS, "/")
    .replace(/^(crate|self|super|std)\//, "")
    .replace(/\/\*$/, "")
    .replace(/^\/+|\/+$/g, "");
}

export function resolveModulePath(
  from: string,
  specifier: string,
  index: ModulePathIndex,
): string | null {
  const relative = relativeSegments(from, specifier);
  const target = relative ?? normalize(specifier);
  if (target.length === 0) return null;
  const segments = target.split("/").filter((segment) => segment.length > 0);

  for (let start = Math.max(0, segments.length - MAX_SUFFIX_SEGMENTS); start < segments.length; start += 1) {
    const key = segments.slice(start).join("/");
    const matches = index.get(key);
    const best = matches?.find((path) => path !== from);
    if (best) return best;
  }
  return null;
}
