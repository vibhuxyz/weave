import type { ResourceRef, TaskContract } from "@weave/protocol";
import { normalizeResource } from "./overlap.ts";

const GLOB_CHARS = /[*?[\]{}!]/;

function claimForPath(allowedPath: string): ResourceRef {
  const segments = allowedPath.split("/").filter((segment) => segment !== "" && segment !== ".");
  const firstGlob = segments.findIndex((segment) => GLOB_CHARS.test(segment));
  if (firstGlob === -1) return normalizeResource({ kind: "file", id: segments.join("/") });
  return normalizeResource({ kind: "directory", id: segments.slice(0, firstGlob).join("/") });
}

function resourceKey(resource: ResourceRef): string {
  return `${resource.kind}:${resource.id}`;
}

export function claimsForTask(task: Pick<TaskContract, "allowedPaths" | "owns">): readonly ResourceRef[] {
  const declared = (task.owns ?? []).map(normalizeResource);
  const fromPaths = (task.allowedPaths ?? []).map(claimForPath);
  const unique = new Map([...declared, ...fromPaths].map((resource) => [resourceKey(resource), resource]));
  return [...unique.values()].sort((a, b) => resourceKey(a).localeCompare(resourceKey(b)));
}
