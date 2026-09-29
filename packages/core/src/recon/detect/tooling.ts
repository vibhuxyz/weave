import { COMPOSE_FILE_PATTERN, DOCKERFILE_PATTERN, README_FILES, SOURCE_DIRECTORIES } from "../constants.ts";
import type { Detection, ManifestFile, MonorepoProfile, RepositoryLayout, RepositoryScan } from "../types.ts";
import { sortDetections } from "./ecosystem.ts";

export interface FileIndex {
  readonly paths: ReadonlySet<string>;
  readonly directories: ReadonlySet<string>;
  readonly baseNames: ReadonlySet<string>;
}

export function indexScan(scan: RepositoryScan): FileIndex {
  return {
    paths: new Set(scan.files.map((file) => file.path)),
    directories: new Set(scan.directories),
    baseNames: new Set(scan.files.map((file) => file.path.split("/").at(-1) ?? "")),
  };
}

function fileMarkers(index: FileIndex, table: readonly (readonly [string, string])[], via: Detection["via"]): Detection[] {
  const byName = new Map<string, Detection>();
  for (const [marker, name] of table) {
    if (!index.paths.has(marker) || byName.has(name)) continue;
    byName.set(name, { name, via, evidence: marker });
  }
  return [...byName.values()];
}

const PACKAGE_MANAGER_MARKERS = [
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
  ["package-lock.json", "npm"],
  ["poetry.lock", "poetry"],
  ["uv.lock", "uv"],
  ["Pipfile.lock", "pipenv"],
  ["requirements.txt", "pip"],
  ["Cargo.lock", "cargo"],
  ["Cargo.toml", "cargo"],
  ["go.mod", "go-modules"],
  ["pom.xml", "maven"],
  ["build.gradle", "gradle"],
  ["build.gradle.kts", "gradle"],
  ["composer.json", "composer"],
  ["Gemfile", "bundler"],
  ["packages.lock.json", "nuget"],
] as const;

const BUILD_SYSTEM_MARKERS = [
  ["Makefile", "make"],
  ["makefile", "make"],
  ["CMakeLists.txt", "cmake"],
  ["pom.xml", "maven"],
  ["build.gradle", "gradle"],
  ["build.gradle.kts", "gradle"],
  ["WORKSPACE", "bazel"],
  ["MODULE.bazel", "bazel"],
  ["turbo.json", "turborepo"],
  ["nx.json", "nx"],
  ["meson.build", "meson"],
  ["BUILD.bazel", "bazel"],
] as const;

const CI_MARKERS = [
  [".gitlab-ci.yml", "gitlab-ci"],
  [".circleci/config.yml", "circleci"],
  ["Jenkinsfile", "jenkins"],
  ["azure-pipelines.yml", "azure-pipelines"],
  [".travis.yml", "travis"],
  ["bitbucket-pipelines.yml", "bitbucket-pipelines"],
  [".drone.yml", "drone"],
] as const;

const MONOREPO_MARKERS = [
  "pnpm-workspace.yaml",
  "turbo.json",
  "nx.json",
  "lerna.json",
  "go.work",
  "rush.json",
] as const;

export function detectPackageManagers(index: FileIndex): Detection[] {
  const found = fileMarkers(index, PACKAGE_MANAGER_MARKERS, "filesystem");
  if (found.length === 0 && index.paths.has("package.json")) {
    found.push({ name: "npm", via: "filesystem", evidence: "package.json without a lockfile" });
  }
  return sortDetections(found);
}

export function detectBuildSystems(index: FileIndex, fromDependencies: readonly Detection[]): Detection[] {
  const found = fileMarkers(index, BUILD_SYSTEM_MARKERS, "filesystem");
  const names = new Set(found.map((detection) => detection.name));
  const msbuild = [...index.baseNames].some((name) => name.endsWith(".csproj") || name.endsWith(".sln"));
  if (msbuild) found.push({ name: "msbuild", via: "filesystem", evidence: "a .csproj or .sln project file" });
  for (const detection of fromDependencies) {
    if (!names.has(detection.name)) found.push(detection);
  }
  return sortDetections(found);
}

export function detectCiSystems(index: FileIndex): Detection[] {
  const found = fileMarkers(index, CI_MARKERS, "filesystem");
  if (index.directories.has(".github/workflows")) {
    found.push({ name: "github-actions", via: "filesystem", evidence: ".github/workflows" });
  }
  return sortDetections(found);
}

export function detectContainers(index: FileIndex): Detection[] {
  const found: Detection[] = [];
  const dockerfile = [...index.baseNames].filter((name) => DOCKERFILE_PATTERN.test(name)).sort()[0];
  if (dockerfile) found.push({ name: "docker", via: "filesystem", evidence: dockerfile });
  const compose = [...index.baseNames].filter((name) => COMPOSE_FILE_PATTERN.test(name)).sort()[0];
  if (compose) found.push({ name: "docker-compose", via: "filesystem", evidence: compose });
  if (index.directories.has(".devcontainer")) {
    found.push({ name: "devcontainer", via: "filesystem", evidence: ".devcontainer" });
  }
  return sortDetections(found);
}

function hasJsonKey(manifests: readonly ManifestFile[], path: string, key: string): boolean {
  const manifest = manifests.find((each) => each.path === path);
  if (!manifest) return false;
  try {
    const parsed: unknown = JSON.parse(manifest.text);
    return typeof parsed === "object" && parsed !== null && key in parsed;
  } catch {
    return false;
  }
}

export function detectMonorepo(index: FileIndex, manifests: readonly ManifestFile[]): MonorepoProfile {
  const evidence: string[] = MONOREPO_MARKERS.filter((marker) => index.paths.has(marker));
  if (hasJsonKey(manifests, "package.json", "workspaces")) evidence.push("package.json workspaces");
  const rootCargo = manifests.find((each) => each.path === "Cargo.toml");
  if (rootCargo && /^\[workspace\][ \t]*$/m.test(rootCargo.text)) evidence.push("Cargo.toml [workspace]");
  if (index.directories.has("apps") && index.directories.has("packages")) evidence.push("apps and packages");
  return { isMonorepo: evidence.length > 0, evidence: [...new Set(evidence)].sort() };
}

export function readLayout(index: FileIndex, hasGit: boolean): RepositoryLayout {
  return {
    hasGit,
    hasReadme: README_FILES.some((name) => index.paths.has(name)),
    hasDockerfile: [...index.baseNames].some((name) => DOCKERFILE_PATTERN.test(name)),
    hasCompose: [...index.baseNames].some((name) => COMPOSE_FILE_PATTERN.test(name)),
    sourceDirectories: SOURCE_DIRECTORIES.filter((name) => index.directories.has(name)),
  };
}
