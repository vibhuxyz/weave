import type { ManifestFile, ManifestKind } from "../types.ts";

const JSON_DEPENDENCY_SECTIONS = ["dependencies", "devDependencies", "peerDependencies", "require", "require-dev"];

const TOML_SECTION = /^\[([^\]]+)\][ \t]*$/;
const TOML_KEY = /^([A-Za-z0-9_.-]+)[ \t]*=/;
const TOML_ARRAY_ITEM = /^["']([A-Za-z0-9_.@/-]+)/;
const REQUIREMENT_NAME = /^([A-Za-z0-9_.-]+)/;
const GO_REQUIRE_LINE = /^(?:require[ \t]+)?([a-z0-9.-]+\.[a-z]{2,}\/[^\s]+)[ \t]+v/;
const MAVEN_COORDINATE = /<(?:groupId|artifactId)>([^<]+)<\/(?:groupId|artifactId)>/g;
const GRADLE_COORDINATE = /['"]([A-Za-z0-9_.-]+):([A-Za-z0-9_.-]+):/g;
const GEMFILE_GEM = /^gem[ \t]+['"]([^'"]+)['"]/;
const PACKAGE_REFERENCE = /<PackageReference[^>]*Include="([^"]+)"/g;

function lines(text: string): string[] {
  return text.split(/\r?\n/).map((line) => line.trim());
}

function fromJson(text: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (typeof parsed !== "object" || parsed === null) return [];
  const record = parsed as Record<string, unknown>;
  const names: string[] = [];
  for (const section of JSON_DEPENDENCY_SECTIONS) {
    const value = record[section];
    if (typeof value === "object" && value !== null) names.push(...Object.keys(value));
  }
  return names;
}

function fromToml(text: string): string[] {
  const names: string[] = [];
  let section = "";
  let inArray = false;
  for (const line of lines(text)) {
    const header = TOML_SECTION.exec(line);
    if (header) {
      section = header[1] ?? "";
      inArray = false;
      continue;
    }
    if (inArray) {
      if (line.startsWith("]")) inArray = false;
      const item = TOML_ARRAY_ITEM.exec(line);
      if (item?.[1]) names.push(item[1]);
      continue;
    }
    if (/^dependencies[ \t]*=[ \t]*\[/.test(line)) {
      inArray = !line.includes("]");
      continue;
    }
    if (!section.includes("dependencies")) continue;
    const key = TOML_KEY.exec(line);
    if (key?.[1]) names.push(key[1]);
  }
  return names;
}

function fromRequirements(text: string): string[] {
  return lines(text)
    .filter((line) => line.length > 0 && !line.startsWith("#") && !line.startsWith("-"))
    .map((line) => REQUIREMENT_NAME.exec(line)?.[1])
    .filter((name): name is string => name !== undefined);
}

function fromGoMod(text: string): string[] {
  return lines(text)
    .map((line) => GO_REQUIRE_LINE.exec(line)?.[1])
    .filter((name): name is string => name !== undefined);
}

function allMatches(text: string, pattern: RegExp, group: number): string[] {
  const names: string[] = [];
  for (const match of text.matchAll(pattern)) {
    const name = match[group];
    if (name) names.push(name);
  }
  return names;
}

function fromGradle(text: string): string[] {
  const names: string[] = [];
  for (const match of text.matchAll(GRADLE_COORDINATE)) {
    const group = match[1];
    const artifact = match[2];
    if (group && artifact) names.push(group, artifact, `${group}:${artifact}`);
  }
  return names;
}

function fromGemfile(text: string): string[] {
  return lines(text)
    .map((line) => GEMFILE_GEM.exec(line)?.[1])
    .filter((name): name is string => name !== undefined);
}

const EXTRACTORS: Readonly<Record<ManifestKind, (text: string) => string[]>> = {
  "package.json": fromJson,
  "composer.json": fromJson,
  "pyproject.toml": fromToml,
  "Cargo.toml": fromToml,
  "requirements.txt": fromRequirements,
  "go.mod": fromGoMod,
  "pom.xml": (text) => allMatches(text, MAVEN_COORDINATE, 1),
  "build.gradle": fromGradle,
  Gemfile: fromGemfile,
  csproj: (text) => allMatches(text, PACKAGE_REFERENCE, 1),
  sln: () => [],
  "CMakeLists.txt": () => [],
  Makefile: () => [],
};

export function extractDependencies(manifests: readonly ManifestFile[]): ReadonlyMap<string, string> {
  const sourceByName = new Map<string, string>();
  for (const manifest of manifests) {
    for (const name of EXTRACTORS[manifest.kind](manifest.text)) {
      const normalized = name.trim().toLowerCase();
      if (normalized.length > 0 && !sourceByName.has(normalized)) sourceByName.set(normalized, manifest.path);
    }
  }
  return sourceByName;
}
