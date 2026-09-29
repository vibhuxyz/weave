export type ReconSignal = "filesystem" | "manifest" | "dependency" | "text";

export interface Detection {
  readonly name: string;
  readonly via: ReconSignal;
  readonly evidence: string;
}

export interface LanguageUsage {
  readonly language: string;
  readonly fileCount: number;
  readonly bytes: number;
}

export interface ScannedFile {
  readonly path: string;
  readonly bytes: number;
}

export interface Skipped {
  readonly path: string;
  readonly reason: string;
}

export interface RepositoryScan {
  readonly root: string;
  readonly files: readonly ScannedFile[];
  readonly directories: readonly string[];
  readonly truncated: boolean;
  readonly skipped: readonly Skipped[];
}

export interface ManifestFile {
  readonly path: string;
  readonly kind: ManifestKind;
  readonly text: string;
}

export const MANIFEST_KINDS = [
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "CMakeLists.txt",
  "Makefile",
  "Gemfile",
  "composer.json",
  "csproj",
  "sln",
] as const;

export type ManifestKind = (typeof MANIFEST_KINDS)[number];

export interface MonorepoProfile {
  readonly isMonorepo: boolean;
  readonly evidence: readonly string[];
}

export interface RepositoryLayout {
  readonly hasGit: boolean;
  readonly hasReadme: boolean;
  readonly hasDockerfile: boolean;
  readonly hasCompose: boolean;
  readonly sourceDirectories: readonly string[];
}

export interface ReconGitState {
  readonly isGitRepo: boolean;
  readonly branch: string | null;
  readonly head: string | null;
  readonly remote: string | null;
  readonly clean: boolean;
  readonly uncommitted: readonly string[];
  readonly recentCommits: readonly { readonly sha: string; readonly subject: string }[];
}

export interface RepositoryProfile {
  readonly root: string;
  readonly languages: readonly LanguageUsage[];
  readonly manifests: readonly { readonly path: string; readonly kind: ManifestKind }[];
  readonly packageManagers: readonly Detection[];
  readonly buildSystems: readonly Detection[];
  readonly frameworks: readonly Detection[];
  readonly databases: readonly Detection[];
  readonly orms: readonly Detection[];
  readonly testSystems: readonly Detection[];
  readonly containers: readonly Detection[];
  readonly ciSystems: readonly Detection[];
  readonly monorepo: MonorepoProfile;
  readonly layout: RepositoryLayout;
  readonly git: ReconGitState;
  readonly truncated: boolean;
  readonly skipped: readonly Skipped[];
}

export interface ReconOptions {
  readonly maxFiles?: number;
  readonly maxDepth?: number;
  readonly maxManifestBytes?: number;
  readonly recentCommits?: number;
  readonly signal?: AbortSignal;
}
