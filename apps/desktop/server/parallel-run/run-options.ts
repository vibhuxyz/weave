import { parseBudgets, type Budgets } from "@weave/core";
import type { RunOptions } from "../shared/index.ts";

const MS_PER_MINUTE = 60_000;
const MAX_RUN_MINUTES = 24 * 60;

export const DEFAULT_RUN_OPTIONS: RunOptions = { adaptive: false, employees: false, budgets: { runMaxCostUsd: null, runMaxMinutes: null, taskMaxCostUsd: null } };

export type ParsedRunOptions =
  | { readonly ok: true; readonly options: RunOptions; readonly budgets: Budgets | undefined }
  | { readonly ok: false; readonly reason: string };

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function minutesOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= MAX_RUN_MINUTES ? value : null;
}

function budgetsOf(options: RunOptions): ReturnType<typeof parseBudgets> | null {
  const { runMaxCostUsd, runMaxMinutes, taskMaxCostUsd } = options.budgets;
  if (runMaxCostUsd === null && runMaxMinutes === null && taskMaxCostUsd === null) return null;
  return parseBudgets({
    ...(runMaxCostUsd !== null || runMaxMinutes !== null
      ? { run: { ...(runMaxCostUsd !== null ? { maxCostUsd: runMaxCostUsd } : {}), ...(runMaxMinutes !== null ? { maxWallMs: runMaxMinutes * MS_PER_MINUTE } : {}) } }
      : {}),
    ...(taskMaxCostUsd !== null ? { task: { maxCostUsd: taskMaxCostUsd } } : {}),
  });
}

export function parseRunOptions(raw: unknown): ParsedRunOptions {
  if (raw === undefined) return { ok: true, options: DEFAULT_RUN_OPTIONS, budgets: undefined };
  if (!isRecord(raw)) return { ok: false, reason: "Run options must be an object." };
  const budgets = isRecord(raw["budgets"]) ? raw["budgets"] : {};
  const options: RunOptions = {
    adaptive: raw["adaptive"] === true,
    employees: raw["employees"] === true,
    budgets: {
      runMaxCostUsd: textOrNull(budgets["runMaxCostUsd"]),
      runMaxMinutes: minutesOrNull(budgets["runMaxMinutes"]),
      taskMaxCostUsd: textOrNull(budgets["taskMaxCostUsd"]),
    },
  };
  const parsed = budgetsOf(options);
  if (parsed && !parsed.ok) return { ok: false, reason: `Cannot start the run: ${parsed.issues.join("; ")}` };
  if (parsed && !options.adaptive) return { ok: false, reason: "Budgets are enforced by adaptive orchestration; turn it on to use them." };
  return { ok: true, options, budgets: parsed?.ok ? parsed.budgets : undefined };
}
