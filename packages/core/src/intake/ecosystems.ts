import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { VerificationRung } from "@weave/protocol";
import type { RungExecution } from "./types.ts";

export interface EcosystemRung {
  readonly rung: VerificationRung;
  readonly command: string;
  readonly why: string;
}

export interface Ecosystem {
  readonly id: string;
  readonly marker: readonly string[];
  readonly markerExtension?: string;
  readonly rungs: (cwd: string) => readonly EcosystemRung[];
  readonly scopedTests?: (paths: readonly string[]) => string | null;
}

function has(cwd: string, name: string): boolean {
  return existsSync(join(cwd, name));
}

function hasExtension(cwd: string, extension: string): boolean {
  try {
    return readdirSync(cwd).some((name) => name.endsWith(extension));
  } catch {
    return false;
  }
}

function pythonRunner(cwd: string): string {
  if (has(cwd, "uv.lock")) return "uv run ";
  if (has(cwd, "poetry.lock")) return "poetry run ";
  return "";
}

function pythonRungs(cwd: string): readonly EcosystemRung[] {
  const run = pythonRunner(cwd);
  const marker = has(cwd, "pyproject.toml") ? "pyproject.toml" : "requirements.txt";
  const found: EcosystemRung[] = [
    { rung: "tests", command: `${run}pytest -q`, why: `${marker} with pytest` },
    { rung: "lint", command: `${run}ruff check .`, why: `${marker} with ruff` },
  ];
  if (has(cwd, "mypy.ini") || has(cwd, "pyproject.toml")) {
    found.push({ rung: "typecheck", command: `${run}mypy .`, why: `${marker} with mypy` });
  }
  return found;
}

function packageDirsOf(paths: readonly string[]): readonly string[] {
  const dirs = paths
    .map((path) => path.split("/").slice(0, -1).join("/"))
    .filter((dir) => dir.length > 0);
  return [...new Set(dirs)].sort();
}

export const ECOSYSTEMS: readonly Ecosystem[] = [
  {
    id: "python",
    marker: ["pyproject.toml", "requirements.txt", "setup.py"],
    rungs: pythonRungs,
    scopedTests: (paths) => {
      const dirs = packageDirsOf(paths);
      return dirs.length === 0 ? null : `pytest -q ${dirs.join(" ")}`;
    },
  },
  {
    id: "go",
    marker: ["go.mod"],
    rungs: () => [
      { rung: "tests", command: "go test ./...", why: "go.mod" },
      { rung: "lint", command: "go vet ./...", why: "go.mod" },
      { rung: "build", command: "go build ./...", why: "go.mod" },
    ],
    scopedTests: (paths) => {
      const dirs = packageDirsOf(paths);
      return dirs.length === 0 ? null : `go test ${dirs.map((dir) => `./${dir}/...`).join(" ")}`;
    },
  },
  {
    id: "rust",
    marker: ["Cargo.toml"],
    rungs: () => [
      { rung: "tests", command: "cargo test", why: "Cargo.toml" },
      { rung: "lint", command: "cargo clippy -- -D warnings", why: "Cargo.toml" },
      { rung: "typecheck", command: "cargo check", why: "Cargo.toml" },
      { rung: "build", command: "cargo build", why: "Cargo.toml" },
    ],
  },
  {
    id: "maven",
    marker: ["pom.xml"],
    rungs: () => [
      { rung: "tests", command: "mvn -q test", why: "pom.xml" },
      { rung: "build", command: "mvn -q -DskipTests package", why: "pom.xml" },
    ],
  },
  {
    id: "gradle",
    marker: ["build.gradle", "build.gradle.kts"],
    rungs: (cwd) => {
      const runner = has(cwd, "gradlew") ? "./gradlew" : "gradle";
      return [
        { rung: "tests", command: `${runner} test`, why: "build.gradle" },
        { rung: "build", command: `${runner} build -x test`, why: "build.gradle" },
      ];
    },
  },
  {
    id: "ruby",
    marker: ["Gemfile"],
    rungs: (cwd) => {
      const found: EcosystemRung[] = [{ rung: "tests", command: "bundle exec rspec", why: "Gemfile" }];
      if (has(cwd, ".rubocop.yml")) {
        found.push({ rung: "lint", command: "bundle exec rubocop", why: ".rubocop.yml" });
      }
      return found;
    },
  },
  {
    id: "php",
    marker: ["composer.json"],
    rungs: (cwd) => {
      const found: EcosystemRung[] = [{ rung: "tests", command: "vendor/bin/phpunit", why: "composer.json" }];
      if (has(cwd, "phpstan.neon") || has(cwd, "phpstan.neon.dist")) {
        found.push({ rung: "typecheck", command: "vendor/bin/phpstan analyse", why: "phpstan.neon" });
      }
      if (has(cwd, ".php-cs-fixer.php") || has(cwd, ".php-cs-fixer.dist.php")) {
        found.push({ rung: "lint", command: "vendor/bin/php-cs-fixer fix --dry-run", why: ".php-cs-fixer.php" });
      }
      return found;
    },
  },
  {
    id: "dotnet",
    marker: ["global.json"],
    markerExtension: ".csproj",
    rungs: () => [
      { rung: "tests", command: "dotnet test", why: "a .NET project file" },
      { rung: "lint", command: "dotnet format --verify-no-changes", why: "a .NET project file" },
      { rung: "build", command: "dotnet build", why: "a .NET project file" },
    ],
  },
  {
    id: "cmake",
    marker: ["CMakeLists.txt"],
    rungs: () => [
      { rung: "tests", command: "ctest --output-on-failure", why: "CMakeLists.txt" },
      { rung: "build", command: "cmake --build build", why: "CMakeLists.txt" },
    ],
  },
];

export function ecosystemsFor(cwd: string): readonly Ecosystem[] {
  return ECOSYSTEMS.filter(
    (ecosystem) =>
      ecosystem.marker.some((marker) => has(cwd, marker)) ||
      (ecosystem.markerExtension !== undefined && hasExtension(cwd, ecosystem.markerExtension)),
  );
}

export function ecosystemRungs(cwd: string): readonly (EcosystemRung & { readonly execution: RungExecution })[] {
  return ecosystemsFor(cwd).flatMap((ecosystem) =>
    ecosystem.rungs(cwd).map((entry) => ({ ...entry, execution: { via: "command", command: entry.command } as RungExecution })),
  );
}
