import { realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

const USER_SKILL_ROOTS = [
  join(".agents", "skills"),
  join(".claude", "skills"),
  join(".codex", "skills"),
  join(".cursor", "skills"),
  join(".grok", "skills"),
  join(".grok", "bundled", "skills"),
  join(".weave", "skills"),
] as const;

const USER_MEMORY_ROOT = join(".grok", "memory-v2");
const MARKDOWN_EXTENSION = ".md";
const UNIX_TEMP_DIRS = ["/tmp", "/private/tmp"] as const;

export function realish(path: string): string {
  let current = resolve(path);
  const trailing: string[] = [];
  for (;;) {
    try {
      return resolve(realpathSync(current), ...trailing.reverse());
    } catch {
      const parent = dirname(current);
      if (parent === current) return resolve(path);
      trailing.push(basename(current));
      current = parent;
    }
  }
}

export function isInside(root: string, candidate: string): boolean {
  const rel = relative(realish(root), realish(candidate));
  return rel === "" || (rel !== ".." && !rel.startsWith("../"));
}

export function isScratchPath(path: string): boolean {
  return [tmpdir(), ...UNIX_TEMP_DIRS].some((root) => isInside(root, path));
}

export function isUserSkillPath(candidate: string, home = homedir()): boolean {
  return USER_SKILL_ROOTS.some((root) => isInside(join(home, root), candidate));
}

export function isUserMemoryNote(candidate: string, home = homedir()): boolean {
  if (!basename(candidate).endsWith(MARKDOWN_EXTENSION)) return false;
  return isInside(join(home, USER_MEMORY_ROOT), candidate);
}

export function isSharedReadPath(candidate: string, home = homedir()): boolean {
  return isUserSkillPath(candidate, home) || isUserMemoryNote(candidate, home);
}

export function relativeInside(root: string, candidate: string): string | null {
  const rel = relative(realish(root), realish(candidate));
  if (rel !== "" && (rel === ".." || rel.startsWith(".."))) return null;
  return rel.split(sep).join("/");
}
