import { realpath } from "node:fs/promises";
import { join } from "node:path";
import { discoverRules } from "../discovery/index.ts";
import { inferArchitecture } from "./architecture/index.ts";
import { loadModuleCache, saveModuleCache } from "./cache/index.ts";
import { CONTEXT_CACHE_FILE } from "./constants.ts";
import { readGitFacts } from "./git/index.ts";
import { buildDependencyGraph } from "./graph/index.ts";
import { parseSources } from "./parse-sources.ts";
import { scanProject } from "./scan/index.ts";
import type { ModuleFacts, ProjectFile, ProjectModel } from "./types.ts";
import { readManifests, stackOf, workspaceOfPath, workspacesOf, type PackageManifest } from "./workspace/index.ts";

const RULE_DIRS = [".weave/rules", ".agents/rules"];

export interface BuildModelOptions {
  readonly root: string;
  readonly weaveDir?: string;
  readonly revision?: number;
}

export interface BuildStats {
  readonly parsed: number;
  readonly reused: number;
  readonly unresolvedImports: number;
}

function byPathThenLine<T extends { readonly file: string; readonly line: number }>(a: T, b: T): number {
  return a.file.localeCompare(b.file) || a.line - b.line;
}

function flatSorted<T extends { readonly file: string; readonly line: number }>(modules: readonly ModuleFacts[], pick: (module: ModuleFacts) => readonly T[]): readonly T[] {
  return modules.flatMap(pick).sort(byPathThenLine);
}

function namedPackages(manifests: readonly PackageManifest[]): ReadonlyMap<string, PackageManifest> {
  return new Map(manifests.flatMap((manifest) => (manifest.name ? [[manifest.name, manifest] as const] : [])));
}

export async function buildProjectModel(options: BuildModelOptions): Promise<{ readonly model: ProjectModel; readonly stats: BuildStats }> {
  const root = await realpath(options.root);
  const cachePath = options.weaveDir ? join(options.weaveDir, CONTEXT_CACHE_FILE) : null;
  const [git, cache, rules] = await Promise.all([
    readGitFacts(root),
    cachePath ? loadModuleCache(cachePath) : Promise.resolve(new Map()),
    discoverRules(RULE_DIRS.map((dir) => join(root, dir))),
  ]);
  const scan = await scanProject(root, git.repository.isGitRepo);
  const paths = scan.files.map((file) => file.path);
  const manifests = await readManifests(root, paths);
  const workspaces = workspacesOf(manifests.manifests, new Set(paths), manifests.workspaceGlobs);
  const located = scan.files.map((file) => ({ ...file, workspace: workspaceOfPath(file.path, workspaces), hash: null }));
  const parsed = await parseSources(root, located, cache);
  const files: readonly ProjectFile[] = located.map((file) => ({ ...file, hash: parsed.cache.get(file.path)?.hash ?? null }));
  const graph = buildDependencyGraph(parsed.modules, { files: new Set(paths), tsPaths: manifests.tsPaths, packagesByName: namedPackages(manifests.manifests) });
  if (cachePath) await saveModuleCache(cachePath, parsed.cache);
  const model: ProjectModel = {
    version: 2,
    revision: options.revision ?? 1,
    repository: git.repository,
    stack: stackOf(paths, manifests.manifests.flatMap((manifest) => manifest.dependencies), manifests.packageManager),
    applications: workspaces.filter((workspace) => workspace.kind === "application"),
    packages: workspaces.filter((workspace) => workspace.kind === "package"),
    files,
    symbols: flatSorted(parsed.modules, (module) => module.symbols),
    dependencies: { internal: graph.internal, external: graph.external, calls: graph.calls },
    apis: flatSorted(parsed.modules, (module) => module.apis),
    events: flatSorted(parsed.modules, (module) => module.events),
    rules: rules.map((rule) => rule.name).sort(),
    recentChanges: git.recentChanges,
    architecture: inferArchitecture(workspaces, files),
    skipped: [...scan.skipped, ...manifests.skipped, ...parsed.skipped],
  };
  return { model, stats: { parsed: parsed.modules.length - parsed.reused, reused: parsed.reused, unresolvedImports: graph.unresolved } };
}
