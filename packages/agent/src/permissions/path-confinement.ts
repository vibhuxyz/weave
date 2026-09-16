import { realpathSync } from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";

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

export function relativeInside(root: string, candidate: string): string | null {
  const rel = relative(realish(root), realish(candidate));
  if (rel !== "" && (rel === ".." || rel.startsWith(".."))) return null;
  return rel.split(sep).join("/");
}
