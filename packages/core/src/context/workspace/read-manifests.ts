import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { detectPackageManager } from "../../intake/index.ts";
import { mapBounded } from "../../shared/index.ts";
import { PARSE_CONCURRENCY } from "../constants.ts";
import type { Skipped } from "../types.ts";
import { parseManifest } from "./parse-manifest.ts";
import { resolveTsPathConfigs } from "./tsconfig-paths.ts";
import type { PackageManifest, TsPathConfig } from "./types.ts";

const TSCONFIG_FILE = /(^|\/)tsconfig[\w.-]*\.json$/;

const PNPM_WORKSPACE_ENTRY = /^\s*-\s*['"]?([^'"#\s]+)['"]?\s*(?:#.*)?$/;

function pnpmWorkspaceGlobs(text: string): readonly string[] {
  return text.split(/\r?\n/).flatMap((line) => PNPM_WORKSPACE_ENTRY.exec(line)?.[1] ?? []);
}

export interface ManifestFacts {
  readonly manifests: readonly PackageManifest[];
  readonly workspaceGlobs: readonly string[];
  readonly tsPaths: readonly TsPathConfig[];
  readonly packageManager: string | null;
  readonly skipped: readonly Skipped[];
}

function manifestOf(path: string, text: string): PackageManifest | Skipped {
  try {
    return parseManifest(dirname(path), text) ?? { path, reason: "package.json is not a JSON object" };
  } catch (error: unknown) {
    if (error instanceof SyntaxError) return { path, reason: `package.json is not valid JSON: ${error.message}` };
    throw error;
  }
}

export async function readManifests(root: string, paths: readonly string[]): Promise<ManifestFacts> {
  const manifestPaths = paths.filter((path) => path === "package.json" || path.endsWith("/package.json"));
  const tsconfigPaths = paths.filter((path) => TSCONFIG_FILE.test(path));
  const pnpmWorkspace = paths.includes("pnpm-workspace.yaml") ? readFile(join(root, "pnpm-workspace.yaml"), "utf8") : Promise.resolve("");
  const [manifestTexts, tsconfigTexts, pnpmText] = await Promise.all([
    mapBounded(manifestPaths, PARSE_CONCURRENCY, async (path) => [path, await readFile(join(root, path), "utf8")] as const),
    mapBounded(tsconfigPaths, PARSE_CONCURRENCY, async (path) => [path, await readFile(join(root, path), "utf8")] as const),
    pnpmWorkspace,
  ]);
  const parsed = manifestTexts.map(([path, text]) => manifestOf(path, text));
  return {
    manifests: parsed.filter((entry): entry is PackageManifest => "dir" in entry),
    workspaceGlobs: pnpmWorkspaceGlobs(pnpmText),
    tsPaths: resolveTsPathConfigs(new Map(tsconfigTexts)),
    packageManager: detectPackageManager(root),
    skipped: parsed.filter((entry): entry is Skipped => "reason" in entry),
  };
}
