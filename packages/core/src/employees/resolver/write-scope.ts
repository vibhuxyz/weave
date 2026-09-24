import { firstMatch } from "@weave/agent/browser";

const GLOB_CHARS = /[*?[\]{}!]/;
const RECURSIVE_SUFFIX = /\/\*\*(?:\/\*)?$/;
const EVERYTHING: ReadonlySet<string> = new Set(["**", "**/*"]);

function staticPrefix(glob: string): string {
  const segments = glob.split("/");
  const firstGlob = segments.findIndex((segment) => GLOB_CHARS.test(segment));
  return (firstGlob === -1 ? segments : segments.slice(0, firstGlob)).join("/");
}

function coversGlob(owned: string, wanted: string): boolean {
  if (EVERYTHING.has(owned) || owned === wanted) return true;
  if (!RECURSIVE_SUFFIX.test(owned)) return false;
  const root = owned.replace(RECURSIVE_SUFFIX, "");
  const wantedRoot = staticPrefix(wanted);
  return !GLOB_CHARS.test(root) && (wantedRoot === root || wantedRoot.startsWith(`${root}/`));
}

export function isWriteCovered(wanted: string, owned: readonly string[]): boolean {
  if (!GLOB_CHARS.test(wanted)) return firstMatch(owned, wanted) !== null;
  return owned.some((glob) => coversGlob(glob, wanted));
}

export function isUnrestricted(owned: readonly string[]): boolean {
  return owned.some((glob) => EVERYTHING.has(glob));
}
