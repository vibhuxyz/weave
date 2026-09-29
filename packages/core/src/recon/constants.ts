import type { ManifestKind } from "./types.ts";

export const MAX_SCANNED_FILES = 20000;
export const MAX_SCAN_DEPTH = 12;
export const MAX_MANIFEST_BYTES = 512 * 1024;
export const MAX_MANIFEST_READS = 16;
export const MAX_RECENT_COMMITS = 10;
export const MAX_UNCOMMITTED_PATHS = 50;
export const MAX_LANGUAGES = 12;
export const MAX_DETECTIONS = 20;

export const IGNORED_DIRECTORIES: readonly string[] = [
  ".git",
  ".hg",
  ".svn",
  ".weave",
  ".venv",
  ".tox",
  ".gradle",
  ".idea",
  ".vscode",
  ".next",
  ".turbo",
  ".nuxt",
  ".svelte-kit",
  "__pycache__",
  "bin",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "obj",
  "out",
  "target",
  "vendor",
  "venv",
];

export const SOURCE_DIRECTORIES: readonly string[] = [
  "apps",
  "cmd",
  "internal",
  "lib",
  "packages",
  "services",
  "src",
  "test",
  "tests",
];

export const README_FILES: readonly string[] = ["README.md", "README.rst", "README.txt", "README"];

export const DOCKERFILE_PATTERN = /^Dockerfile(\..+)?$/;

export const COMPOSE_FILE_PATTERN = /^(docker-)?compose(\..+)?\.ya?ml$/;

export const MANIFEST_BY_FILENAME: ReadonlyMap<string, ManifestKind> = new Map([
  ["package.json", "package.json"],
  ["pyproject.toml", "pyproject.toml"],
  ["requirements.txt", "requirements.txt"],
  ["Cargo.toml", "Cargo.toml"],
  ["go.mod", "go.mod"],
  ["pom.xml", "pom.xml"],
  ["build.gradle", "build.gradle"],
  ["build.gradle.kts", "build.gradle"],
  ["CMakeLists.txt", "CMakeLists.txt"],
  ["Makefile", "Makefile"],
  ["makefile", "Makefile"],
  ["GNUmakefile", "Makefile"],
  ["Gemfile", "Gemfile"],
  ["composer.json", "composer.json"],
]);

export const MANIFEST_BY_EXTENSION: ReadonlyMap<string, ManifestKind> = new Map([
  [".csproj", "csproj"],
  [".fsproj", "csproj"],
  [".sln", "sln"],
]);
