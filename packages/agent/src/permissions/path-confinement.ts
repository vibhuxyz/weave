import { realpathSync } from "node:fs";
import { homedir } from "node:os";
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

export function isUserSkillPath(candidate: string, home = homedir()): boolean {
  return USER_SKILL_ROOTS.some((root) => isInside(join(home, root), candidate));
}

export function relativeInside(root: string, candidate: string): string | null {
  const rel = relative(realish(root), realish(candidate));
  if (rel !== "" && (rel === ".." || rel.startsWith(".."))) return null;
  return rel.split(sep).join("/");
}
