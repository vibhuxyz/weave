/** Last path segment, without pulling node:path into the browser bundle. */
export function basename(path: string): string {
  const trimmed = path.replace(/[/\\]+$/, "");
  const index = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return index === -1 ? trimmed : trimmed.slice(index + 1);
}

/** `/Users/me/Coding/perp` → `~/Coding/perp` (best effort, display only). */
export function tildeHome(path: string): string {
  const match = /^\/(?:Users|home)\/[^/]+/.exec(path);
  return match ? `~${path.slice(match[0].length)}` : path;
}
