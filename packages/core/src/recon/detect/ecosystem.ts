import { MAX_DETECTIONS } from "../constants.ts";
import type { Detection } from "../types.ts";
import {
  BUILD_SYSTEM_BY_DEPENDENCY,
  DATABASE_BY_DEPENDENCY,
  FRAMEWORK_BY_DEPENDENCY,
  ORM_BY_DEPENDENCY,
  TEST_SYSTEM_BY_DEPENDENCY,
} from "./constants.ts";

export type DependencySources = ReadonlyMap<string, string>;

function matchTable(
  dependencies: DependencySources,
  table: ReadonlyMap<string, string>,
): Detection[] {
  const byName = new Map<string, Detection>();
  for (const [dependency, source] of dependencies) {
    const name = table.get(dependency) ?? prefixMatch(dependency, table);
    if (!name || byName.has(name)) continue;
    byName.set(name, { name, via: "dependency", evidence: `${dependency} in ${source}` });
  }
  return sortDetections([...byName.values()]);
}

function prefixMatch(dependency: string, table: ReadonlyMap<string, string>): string | null {
  for (const [key, name] of table) {
    if (key.includes("/") && dependency.startsWith(`${key}/`)) return name;
  }
  return null;
}

export function sortDetections(detections: Detection[]): Detection[] {
  return detections.sort((a, b) => a.name.localeCompare(b.name)).slice(0, MAX_DETECTIONS);
}

export function detectFrameworks(dependencies: DependencySources): Detection[] {
  return matchTable(dependencies, FRAMEWORK_BY_DEPENDENCY);
}

export function detectDatabases(dependencies: DependencySources): Detection[] {
  return matchTable(dependencies, DATABASE_BY_DEPENDENCY);
}

export function detectOrms(dependencies: DependencySources): Detection[] {
  return matchTable(dependencies, ORM_BY_DEPENDENCY);
}

export function detectTestSystems(dependencies: DependencySources): Detection[] {
  return matchTable(dependencies, TEST_SYSTEM_BY_DEPENDENCY);
}

export function detectBuildSystemsFromDependencies(dependencies: DependencySources): Detection[] {
  return matchTable(dependencies, BUILD_SYSTEM_BY_DEPENDENCY);
}
