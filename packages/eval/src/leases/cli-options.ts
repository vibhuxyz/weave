import { parseArgs } from "node:util";
import { DEFAULT_CONFIG } from "./constants.ts";
import type { SimulationConfig } from "./types.ts";

const MAX_TASKS = 20_000;
const MAX_WORKERS = 1_000;
const MAX_RUNS = 50;
const MAX_ATTEMPTS = 100;
const MAX_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_RUNS = 5;

export const USAGE = `Simulate Weave's lease scheduler: workers lease tasks, heartbeat, crash or hang, and other workers take over.

  bun run simulate:leases [options]

  --tasks N            tasks to run (default ${DEFAULT_CONFIG.tasks})
  --workers N          workers (default ${DEFAULT_CONFIG.workers})
  --lease-ms N         lease length (default ${DEFAULT_CONFIG.leaseMs})
  --heartbeat-ms N     heartbeat interval (default ${DEFAULT_CONFIG.heartbeatMs})
  --sweep-ms N         how often expired leases are collected (default ${DEFAULT_CONFIG.sweepMs})
  --crash R            chance an attempt crashes, 0..1 (default ${DEFAULT_CONFIG.crashRate})
  --hang R             chance an attempt hangs and later writes late, 0..1 (default ${DEFAULT_CONFIG.hangRate})
  --wrong R            chance an attempt returns a wrong result, 0..1 (default ${DEFAULT_CONFIG.wrongOutputRate})
  --deps R             share of tasks that depend on an earlier task, 0..1 (default ${DEFAULT_CONFIG.dependencyRate})
  --max-attempts N     attempts before a task fails (default ${DEFAULT_CONFIG.maxAttempts})
  --seed TEXT          same seed, same run (default ${DEFAULT_CONFIG.seed})
  --timeline           print every event
  --replay SPEED       play the events back live, SPEED times faster than simulated time
  --bench              run the benchmark matrix instead of one simulation
  --runs N             seeded runs per benchmark row (default ${DEFAULT_RUNS})
  --help               show this`;

export type CliMode =
  | { readonly kind: "help" }
  | { readonly kind: "simulate"; readonly config: SimulationConfig; readonly shouldShowTimeline: boolean; readonly replaySpeed: number | null }
  | { readonly kind: "bench"; readonly config: SimulationConfig; readonly runs: number };

export type CliResult = { readonly ok: true; readonly mode: CliMode } | { readonly ok: false; readonly reason: string };

type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };

const OPTIONS = {
  tasks: { type: "string" }, workers: { type: "string" }, "lease-ms": { type: "string" }, "heartbeat-ms": { type: "string" },
  "sweep-ms": { type: "string" }, crash: { type: "string" }, hang: { type: "string" }, wrong: { type: "string" }, deps: { type: "string" },
  "max-attempts": { type: "string" }, seed: { type: "string" }, timeline: { type: "boolean" }, replay: { type: "string" },
  bench: { type: "boolean" }, runs: { type: "string" }, help: { type: "boolean" },
} as const;

type Values = ReturnType<typeof parseArgs<{ options: typeof OPTIONS }>>["values"];
type NumberKey = Exclude<keyof SimulationConfig, "seed">;
type NumberFlag = "tasks" | "workers" | "lease-ms" | "heartbeat-ms" | "sweep-ms" | "max-attempts" | "crash" | "hang" | "wrong" | "deps";

interface FieldRule {
  readonly key: NumberKey;
  readonly flag: NumberFlag;
  readonly kind: "count" | "rate";
  readonly max: number;
}

const FIELD_RULES: readonly FieldRule[] = [
  { key: "tasks", flag: "tasks", kind: "count", max: MAX_TASKS },
  { key: "workers", flag: "workers", kind: "count", max: MAX_WORKERS },
  { key: "leaseMs", flag: "lease-ms", kind: "count", max: MAX_MS },
  { key: "heartbeatMs", flag: "heartbeat-ms", kind: "count", max: MAX_MS },
  { key: "sweepMs", flag: "sweep-ms", kind: "count", max: MAX_MS },
  { key: "maxAttempts", flag: "max-attempts", kind: "count", max: MAX_ATTEMPTS },
  { key: "crashRate", flag: "crash", kind: "rate", max: 1 },
  { key: "hangRate", flag: "hang", kind: "rate", max: 1 },
  { key: "wrongOutputRate", flag: "wrong", kind: "rate", max: 1 },
  { key: "dependencyRate", flag: "deps", kind: "rate", max: 1 },
];

function count(flag: string, raw: string, max: number): Parsed<number> {
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 && value <= max ? { ok: true, value } : { ok: false, reason: `--${flag} must be a whole number from 1 to ${max}, got ${raw}` };
}

function rate(flag: string, raw: string): Parsed<number> {
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? { ok: true, value } : { ok: false, reason: `--${flag} must be between 0 and 1, got ${raw}` };
}

function speed(raw: string | undefined): Parsed<number | null> {
  if (raw === undefined) return { ok: true, value: null };
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? { ok: true, value } : { ok: false, reason: `--replay must be a positive number, got ${raw}` };
}

function configOf(values: Values): Parsed<SimulationConfig> {
  const numbers: Partial<Record<NumberKey, number>> = {};
  for (const rule of FIELD_RULES) {
    const raw = values[rule.flag];
    const parsed = raw === undefined ? { ok: true as const, value: DEFAULT_CONFIG[rule.key] } : rule.kind === "rate" ? rate(rule.flag, raw) : count(rule.flag, raw, rule.max);
    if (!parsed.ok) return parsed;
    numbers[rule.key] = parsed.value;
  }
  const config: SimulationConfig = { ...DEFAULT_CONFIG, ...numbers, seed: values.seed ?? DEFAULT_CONFIG.seed };
  if (config.crashRate + config.hangRate + config.wrongOutputRate > 1) return { ok: false, reason: "--crash, --hang and --wrong must add up to at most 1" };
  return { ok: true, value: config };
}

function modeOf(values: Values): CliResult {
  if (values.help) return { ok: true, mode: { kind: "help" } };
  const config = configOf(values);
  if (!config.ok) return config;
  if (values.bench) {
    const runs = values.runs === undefined ? { ok: true as const, value: DEFAULT_RUNS } : count("runs", values.runs, MAX_RUNS);
    return runs.ok ? { ok: true, mode: { kind: "bench", config: config.value, runs: runs.value } } : runs;
  }
  const replaySpeed = speed(values.replay);
  if (!replaySpeed.ok) return replaySpeed;
  return { ok: true, mode: { kind: "simulate", config: config.value, shouldShowTimeline: values.timeline ?? false, replaySpeed: replaySpeed.value } };
}

function isArgumentError(error: unknown): error is Error {
  return error instanceof Error && "code" in error && typeof error.code === "string" && error.code.startsWith("ERR_PARSE_ARGS");
}

export function parseCliOptions(args: readonly string[]): CliResult {
  try {
    return modeOf(parseArgs({ args: [...args], options: OPTIONS, strict: true, allowPositionals: false }).values);
  } catch (error: unknown) {
    if (isArgumentError(error)) return { ok: false, reason: error.message };
    throw error;
  }
}
