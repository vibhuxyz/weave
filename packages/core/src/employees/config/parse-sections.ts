import { VERIFICATION_RUNGS, type VerificationRung } from "@weave/protocol";
import { isRecord, isSafeRelativeGlob, readStringList, type FieldContext } from "../../shared/index.ts";
import { DEFAULT_MEMORY, DEFAULT_PERMISSIONS, type EmployeePermissions, type EnginePolicy, type MemoryPolicy, type VerificationPolicy } from "../model/index.ts";
import { MAX_ITEM_CHARS, MAX_LIST_ITEMS } from "../model/constants.ts";

const LIST_LIMITS = { maxItems: MAX_LIST_ITEMS, maxChars: MAX_ITEM_CHARS };
const MAX_MEMORY_ENTRIES = 5_000;
const MAX_RECALL = 50;

function section(ctx: FieldContext, key: string): FieldContext | null {
  const value = ctx.record[key];
  if (value === undefined || value === null) return null;
  if (isRecord(value)) return { record: value, where: `${ctx.where}.${key}`, issues: ctx.issues };
  ctx.issues.push(`${ctx.where}.${key} must be a map`);
  return null;
}

function readBoolean(ctx: FieldContext | null, key: string, fallback: boolean): boolean {
  const value = ctx?.record[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  ctx?.issues.push(`${ctx.where}.${key} must be true or false`);
  return fallback;
}

function readInteger(ctx: FieldContext | null, key: string, limits: { readonly fallback: number; readonly max: number }): number {
  const value = ctx?.record[key];
  if (value === undefined || value === null) return limits.fallback;
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= limits.max) return value;
  ctx?.issues.push(`${ctx?.where}.${key} must be an integer from 0 to ${limits.max}`);
  return limits.fallback;
}

export function readList(ctx: FieldContext | null, key: string, fallback: readonly string[] = []): readonly string[] {
  if (!ctx || ctx.record[key] === undefined || ctx.record[key] === null) return fallback;
  return readStringList(ctx, key, LIST_LIMITS);
}

function readGlobs(ctx: FieldContext | null, key: string, fallback: readonly string[]): readonly string[] {
  const globs = readList(ctx, key, fallback);
  for (const glob of globs.filter((candidate) => !isSafeRelativeGlob(candidate))) {
    ctx?.issues.push(`${ctx.where}.${key}: ${JSON.stringify(glob)} must be a relative path inside the project`);
  }
  return globs;
}

export function readPermissions(root: FieldContext): EmployeePermissions {
  const permissions = section(root, "permissions");
  const filesystem = permissions ? section(permissions, "filesystem") : null;
  const flag = (name: "deployment" | "network" | "git", key: string, fallback: boolean): boolean =>
    readBoolean(permissions ? section(permissions, name) : null, key, fallback);
  return {
    filesystem: {
      read: readGlobs(filesystem, "read", DEFAULT_PERMISSIONS.filesystem.read),
      write: readGlobs(filesystem, "write", DEFAULT_PERMISSIONS.filesystem.write),
    },
    deployment: { allowed: flag("deployment", "allowed", DEFAULT_PERMISSIONS.deployment.allowed) },
    network: { allowed: flag("network", "allowed", DEFAULT_PERMISSIONS.network.allowed) },
    git: { commit: flag("git", "commit", DEFAULT_PERMISSIONS.git.commit) },
  };
}

export function readEnginePolicy(root: FieldContext): EnginePolicy {
  const engines = section(root, "engines");
  const allowed = engines && engines.record["allowed"] !== undefined ? readList(engines, "allowed") : null;
  return { preferred: readList(engines, "preferred"), allowed };
}

function readRungs(root: FieldContext, verification: FieldContext | null, key: string): readonly VerificationRung[] {
  const rungs = readList(verification, key).flatMap((name): VerificationRung[] => {
    const rung = VERIFICATION_RUNGS.find((candidate) => candidate === name);
    if (!rung) root.issues.push(`${root.where}.verification.${key}: ${JSON.stringify(name)} is not a verification rung (${VERIFICATION_RUNGS.join(", ")})`);
    return rung ? [rung] : [];
  });
  return [...new Set(rungs)];
}

export function readVerification(root: FieldContext): VerificationPolicy {
  const verification = section(root, "verification");
  const required = readRungs(root, verification, "required");
  const preferred = readRungs(root, verification, "preferred").filter((rung) => !required.includes(rung));
  return { required, preferred };
}

export function readMemory(root: FieldContext): MemoryPolicy {
  const memory = section(root, "memory");
  return {
    enabled: readBoolean(memory, "enabled", DEFAULT_MEMORY.enabled),
    maxEntries: readInteger(memory, "maxEntries", { fallback: DEFAULT_MEMORY.maxEntries, max: MAX_MEMORY_ENTRIES }),
    recallCount: readInteger(memory, "recallCount", { fallback: DEFAULT_MEMORY.recallCount, max: MAX_RECALL }),
  };
}
