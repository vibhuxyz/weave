import type { ResourceRef, TaskContract } from "@weave/protocol";
import { isSafeRelativeGlob } from "../../shared/index.ts";
import { claimsForTask, describeResource } from "../ownership/index.ts";
import { MAX_EXPAND_PATHS } from "../employee/constants.ts";

export type ExpandDecision =
  | { readonly ok: true; readonly paths: readonly string[]; readonly claims: readonly ResourceRef[] }
  | { readonly ok: false; readonly reason: string };

export interface ExpandInput {
  readonly task: TaskContract;
  readonly paths: readonly string[];
  readonly ownerOf: (resource: ResourceRef) => string | null;
}

function alreadyAllowed(task: TaskContract, path: string): boolean {
  return (task.allowedPaths ?? []).includes(path);
}

export function decideExpansion(input: ExpandInput): ExpandDecision {
  const wanted = [...new Set(input.paths.map((path) => path.trim()))].filter((path) => path.length > 0).sort();
  if (wanted.length === 0) return { ok: false, reason: "no path was requested" };
  if (wanted.length > MAX_EXPAND_PATHS) {
    return { ok: false, reason: `asked for ${wanted.length} paths, the limit is ${MAX_EXPAND_PATHS}` };
  }

  const unsafe = wanted.filter((path) => !isSafeRelativeGlob(path));
  if (unsafe.length > 0) {
    return { ok: false, reason: `${unsafe.join(", ")} must be repository-relative and must not escape the project` };
  }

  const fresh = wanted.filter((path) => !alreadyAllowed(input.task, path));
  if (fresh.length === 0) return { ok: false, reason: "those paths are already in scope" };

  const claims = claimsForTask({ allowedPaths: fresh });
  const taken = claims.flatMap((resource) => {
    const holder = input.ownerOf(resource);
    return holder === null || holder === input.task.id ? [] : [`${describeResource(resource)} is held by ${holder}`];
  });
  if (taken.length > 0) return { ok: false, reason: taken.sort().join("; ") };

  return { ok: true, paths: fresh, claims };
}
