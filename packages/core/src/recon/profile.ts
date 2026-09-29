import { MAX_RECENT_COMMITS } from "./constants.ts";
import {
  detectBuildSystems,
  detectBuildSystemsFromDependencies,
  detectCiSystems,
  detectContainers,
  detectDatabases,
  detectFrameworks,
  detectLanguages,
  detectMonorepo,
  detectOrms,
  detectPackageManagers,
  detectTestSystems,
  extractDependencies,
  indexScan,
  readLayout,
} from "./detect/index.ts";
import { readReconGitState } from "./git-state.ts";
import { DEFAULT_SCAN_LIMITS, readManifests, scanRepository } from "./scan.ts";
import type { ReconOptions, RepositoryProfile, Skipped } from "./types.ts";

export async function profileRepository(
  root: string,
  options: ReconOptions = {},
): Promise<RepositoryProfile> {
  const maxFiles = options.maxFiles ?? DEFAULT_SCAN_LIMITS.maxFiles;
  const maxDepth = options.maxDepth ?? DEFAULT_SCAN_LIMITS.maxDepth;
  const maxManifestBytes = options.maxManifestBytes ?? DEFAULT_SCAN_LIMITS.maxManifestBytes;

  const scan = await scanRepository(root, { maxFiles, maxDepth, signal: options.signal });
  const [{ manifests, skipped: manifestSkipped }, git] = await Promise.all([
    readManifests(scan, maxManifestBytes),
    readReconGitState(root, options.recentCommits ?? MAX_RECENT_COMMITS),
  ]);

  const index = indexScan(scan);
  const dependencies = extractDependencies(manifests);
  const skipped: Skipped[] = [...scan.skipped, ...manifestSkipped].sort((a, b) =>
    a.path.localeCompare(b.path),
  );

  return {
    root,
    languages: detectLanguages(scan.files),
    manifests: manifests.map((manifest) => ({ path: manifest.path, kind: manifest.kind })),
    packageManagers: detectPackageManagers(index),
    buildSystems: detectBuildSystems(index, detectBuildSystemsFromDependencies(dependencies)),
    frameworks: detectFrameworks(dependencies),
    databases: detectDatabases(dependencies),
    orms: detectOrms(dependencies),
    testSystems: detectTestSystems(dependencies),
    containers: detectContainers(index),
    ciSystems: detectCiSystems(index),
    monorepo: detectMonorepo(index, manifests),
    layout: readLayout(index, git.isGitRepo),
    git,
    truncated: scan.truncated,
    skipped,
  };
}
