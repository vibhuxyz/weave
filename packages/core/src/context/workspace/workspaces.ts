import { posix } from "node:path";
import type { Workspace, WorkspaceKind } from "../types.ts";
import type { PackageManifest } from "./types.ts";

const APPLICATION_ROOTS = /^(apps|services|servers|sites)\//;
const PACKAGE_ROOTS = /^(packages|libs|modules|shared)\//;
const RUNNABLE_SCRIPTS = ["start", "dev", "serve"];
const CONVENTIONAL_ENTRIES = ["src/index.ts", "src/main.ts", "src/main.tsx", "src/server.ts", "server/index.ts", "index.ts", "index.js", "src/index.js"];

function kindOf(manifest: PackageManifest): WorkspaceKind {
  const dir = `${manifest.dir}/`;
  if (APPLICATION_ROOTS.test(dir)) return "application";
  if (PACKAGE_ROOTS.test(dir)) return "package";
  const isRunnable = manifest.hasBin || RUNNABLE_SCRIPTS.some((script) => script in manifest.scripts);
  return isRunnable ? "application" : "package";
}

function joined(dir: string, path: string): string {
  return posix.normalize(posix.join(dir, path)).replace(/^\.\//, "");
}

function entrypointsOf(manifest: PackageManifest, filePaths: ReadonlySet<string>): readonly string[] {
  const declared = [...manifest.entryFields, ...Object.values(manifest.exportsMap)].map((path) => joined(manifest.dir, path));
  const conventional = CONVENTIONAL_ENTRIES.map((path) => joined(manifest.dir, path));
  return [...new Set([...declared, ...conventional])].filter((path) => filePaths.has(path)).sort();
}

function globPattern(glob: string): RegExp {
  const body = glob
    .replace(/^\.\//, "")
    .replace(/\/+$/, "")
    .split("/")
    .map((part) => (part === "**" ? ".+" : part.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]+")))
    .join("/");
  return new RegExp(`^${body}$`);
}

function chooseWorkspaces(manifests: readonly PackageManifest[], globs: readonly string[]): readonly PackageManifest[] {
  const nested = manifests.filter((manifest) => manifest.dir !== ".");
  if (globs.length > 0) {
    const include = globs.filter((glob) => !glob.startsWith("!")).map(globPattern);
    const exclude = globs.filter((glob) => glob.startsWith("!")).map((glob) => globPattern(glob.slice(1)));
    const listed = nested.filter((manifest) => include.some((pattern) => pattern.test(manifest.dir)) && !exclude.some((pattern) => pattern.test(manifest.dir)));
    if (listed.length > 0) return listed;
  }
  return nested.length > 0 ? nested : manifests;
}

function uniqueNames(manifests: readonly PackageManifest[]): ReadonlyMap<PackageManifest, string> {
  const counts = new Map<string, number>();
  for (const manifest of manifests) counts.set(manifest.name ?? manifest.dir, (counts.get(manifest.name ?? manifest.dir) ?? 0) + 1);
  return new Map(manifests.map((manifest) => {
    const name = manifest.name ?? manifest.dir;
    return [manifest, (counts.get(name) ?? 0) > 1 ? `${name} (${manifest.dir})` : name];
  }));
}

export function workspacesOf(manifests: readonly PackageManifest[], filePaths: ReadonlySet<string>, extraGlobs: readonly string[] = []): readonly Workspace[] {
  const rootGlobs = manifests.find((manifest) => manifest.dir === ".")?.workspaceGlobs ?? [];
  const chosen = chooseWorkspaces(manifests, [...rootGlobs, ...extraGlobs]);
  const displayNames = uniqueNames(chosen);
  const names = new Set(chosen.map((manifest) => manifest.name ?? manifest.dir));
  return chosen
    .map((manifest) => ({
      name: displayNames.get(manifest) ?? manifest.dir,
      dir: manifest.dir,
      kind: kindOf(manifest),
      scripts: Object.keys(manifest.scripts).sort(),
      internalDependencies: manifest.dependencies.filter((dependency) => names.has(dependency) && dependency !== manifest.name),
      dependencies: manifest.dependencies,
      entrypoints: entrypointsOf(manifest, filePaths),
    }))
    .sort((a, b) => a.dir.localeCompare(b.dir));
}

export function workspaceOfPath(path: string, workspaces: readonly Workspace[]): string | null {
  const owner = workspaces
    .filter((workspace) => workspace.dir === "." || path === workspace.dir || path.startsWith(`${workspace.dir}/`))
    .sort((a, b) => b.dir.length - a.dir.length)[0];
  return owner?.name ?? null;
}
