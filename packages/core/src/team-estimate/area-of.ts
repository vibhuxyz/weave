import { CONTAINER_AREA_DEPTH, CONTAINER_DIRS, ROOT_AREA } from "./constants.ts";

function normalized(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

function fallbackArea(path: string): string {
  const segments = path.split("/");
  const [first] = segments;
  if (first === undefined || segments.length < 2) return ROOT_AREA;
  const depth = CONTAINER_DIRS.has(first) && segments.length > CONTAINER_AREA_DEPTH ? CONTAINER_AREA_DEPTH : 1;
  return segments.slice(0, depth).join("/");
}

export function areaOf(path: string, workspaceDirs: readonly string[]): string {
  const clean = normalized(path);
  const owner = workspaceDirs
    .filter((dir) => clean === dir || clean.startsWith(`${dir}/`))
    .reduce<string | null>((best, dir) => (best === null || dir.length > best.length ? dir : best), null);
  return owner ?? fallbackArea(clean);
}

export function workspaceDirsOf(workspaces: readonly { readonly dir: string }[]): readonly string[] {
  return [...new Set(workspaces.map((workspace) => normalized(workspace.dir)).filter((dir) => dir !== "" && dir !== ROOT_AREA))].sort();
}
