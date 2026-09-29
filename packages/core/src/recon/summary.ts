import type { Detection, RepositoryProfile } from "./types.ts";

export interface ReconSummary {
  readonly languages: readonly string[];
  readonly frameworks: readonly string[];
  readonly packageManager: string | null;
  readonly buildSystems: readonly string[];
  readonly databases: readonly string[];
  readonly orms: readonly string[];
  readonly tests: readonly string[];
  readonly containerized: boolean;
  readonly ci: readonly string[];
  readonly monorepo: boolean;
  readonly branch: string | null;
  readonly clean: boolean;
}

function names(detections: readonly Detection[]): string[] {
  return detections.map((detection) => detection.name);
}

export function summarizeProfile(profile: RepositoryProfile): ReconSummary {
  return {
    languages: profile.languages.map((usage) => usage.language),
    frameworks: names(profile.frameworks),
    packageManager: profile.packageManagers[0]?.name ?? null,
    buildSystems: names(profile.buildSystems),
    databases: names(profile.databases),
    orms: names(profile.orms),
    tests: names(profile.testSystems),
    containerized: profile.containers.length > 0,
    ci: names(profile.ciSystems),
    monorepo: profile.monorepo.isMonorepo,
    branch: profile.git.branch,
    clean: profile.git.clean,
  };
}
