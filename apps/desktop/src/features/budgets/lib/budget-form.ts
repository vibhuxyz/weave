import type { BudgetSettings, LimitSettings } from "../types";

export const LIMIT_SCOPES = ["project", "run", "task", "employee"] as const;

export type LimitScope = (typeof LIMIT_SCOPES)[number];

export interface LimitRowValues {
  readonly costUsd: string;
  readonly tokens: string;
  readonly minutes: string;
}

export interface EngineRowValues extends LimitRowValues {
  readonly engineId: string;
}

export interface BudgetFormValues {
  readonly scopes: Readonly<Record<LimitScope, LimitRowValues>>;
  readonly engines: readonly EngineRowValues[];
}

const MS_PER_MINUTE = 60_000;
const MINUTE_DECIMALS = 2;
const COST_PATTERN = /^\d{1,9}(\.\d{1,6})?$/;
const WHOLE_NUMBER = /^[1-9]\d*$/;
const MINUTES_PATTERN = /^\d+(\.\d+)?$/;

export const EMPTY_ROW: LimitRowValues = { costUsd: "", tokens: "", minutes: "" };

export function costProblem(value: string): string | null {
  return value.trim() === "" || COST_PATTERN.test(value.trim()) ? null : "Use dollars such as 2.50";
}

export function tokensProblem(value: string): string | null {
  return value.trim() === "" || WHOLE_NUMBER.test(value.trim()) ? null : "Use a whole number above 0";
}

export function minutesProblem(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" || (MINUTES_PATTERN.test(trimmed) && Number(trimmed) > 0) ? null : "Use minutes above 0";
}

export function engineIdProblem(engineId: string, rows: readonly EngineRowValues[]): string | null {
  const trimmed = engineId.trim();
  if (trimmed === "") return "Name the engine";
  return rows.filter((row) => row.engineId.trim() === trimmed).length > 1 ? "This engine is listed twice" : null;
}

function rowOf(limits: LimitSettings | undefined): LimitRowValues {
  return {
    costUsd: limits?.maxCostUsd ?? "",
    tokens: limits?.maxTokens === undefined ? "" : String(limits.maxTokens),
    minutes: limits?.maxWallMs === undefined ? "" : String(Number((limits.maxWallMs / MS_PER_MINUTE).toFixed(MINUTE_DECIMALS))),
  };
}

function limitsOf(row: LimitRowValues): LimitSettings | null {
  const costUsd = row.costUsd.trim();
  const tokens = row.tokens.trim();
  const minutes = row.minutes.trim();
  if (!costUsd && !tokens && !minutes) return null;
  return {
    ...(costUsd ? { maxCostUsd: costUsd } : {}),
    ...(tokens ? { maxTokens: Number(tokens) } : {}),
    ...(minutes ? { maxWallMs: Math.max(1, Math.round(Number(minutes) * MS_PER_MINUTE)) } : {}),
  };
}

export function toFormValues(settings: BudgetSettings): BudgetFormValues {
  const scopes = Object.fromEntries(LIMIT_SCOPES.map((scope) => [scope, rowOf(settings[scope])])) as Record<LimitScope, LimitRowValues>;
  const engines = Object.entries(settings.engine ?? {}).map(([engineId, limits]) => ({ engineId, ...rowOf(limits) }));
  return { scopes, engines };
}

export function toSettings(values: BudgetFormValues): BudgetSettings {
  const scoped = LIMIT_SCOPES.flatMap((scope) => {
    const limits = limitsOf(values.scopes[scope]);
    return limits ? [[scope, limits] as const] : [];
  });
  const engines = values.engines.flatMap((row) => {
    const limits = limitsOf(row);
    const engineId = row.engineId.trim();
    return limits && engineId ? [[engineId, limits] as const] : [];
  });
  return { ...Object.fromEntries(scoped), ...(engines.length > 0 ? { engine: Object.fromEntries(engines) } : {}) };
}
