import { isRecord, parseUsd } from "../../shared/index.ts";
import type { Budgets, Limits } from "./types.ts";

const SCOPES = ["project", "run", "task", "employee"] as const;
const MAX_ENGINE_BUDGETS = 32;

export type ParseBudgetsResult = { readonly ok: true; readonly budgets: Budgets } | { readonly ok: false; readonly issues: readonly string[] };

function readPositive(record: Record<string, unknown>, key: string, where: string, issues: string[]): number | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  issues.push(`${where}.${key} must be a positive integer`);
  return undefined;
}

function parseLimits(raw: unknown, where: string, issues: string[]): Limits | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) {
    issues.push(`${where} must be an object`);
    return undefined;
  }
  const cost = raw["maxCostUsd"];
  const maxCostMicroUsd = typeof cost === "string" ? parseUsd(cost) : null;
  if (cost !== undefined && maxCostMicroUsd === null) issues.push(`${where}.maxCostUsd must be a decimal string such as "2.50"`);
  const maxTokens = readPositive(raw, "maxTokens", where, issues);
  const maxWallMs = readPositive(raw, "maxWallMs", where, issues);
  return {
    ...(maxCostMicroUsd === null ? {} : { maxCostMicroUsd }),
    ...(maxTokens === undefined ? {} : { maxTokens }),
    ...(maxWallMs === undefined ? {} : { maxWallMs }),
  };
}

function parseEngines(raw: unknown, issues: string[]): Record<string, Limits> | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw) || Object.keys(raw).length > MAX_ENGINE_BUDGETS) {
    issues.push(`budgets.engine must be an object with at most ${MAX_ENGINE_BUDGETS} engines`);
    return undefined;
  }
  return Object.fromEntries(Object.keys(raw).sort().flatMap((engineId) => {
    const limits = parseLimits(raw[engineId], `budgets.engine.${engineId}`, issues);
    return limits ? [[engineId, limits]] : [];
  }));
}

export function parseBudgets(raw: unknown): ParseBudgetsResult {
  if (!isRecord(raw)) return { ok: false, issues: ["budgets must be an object"] };
  const issues: string[] = [];
  const scoped = Object.fromEntries(SCOPES.flatMap((scope) => {
    const limits = parseLimits(raw[scope], `budgets.${scope}`, issues);
    return limits ? [[scope, limits]] : [];
  }));
  const engine = parseEngines(raw["engine"], issues);
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, budgets: { ...scoped, ...(engine ? { engine } : {}) } };
}
