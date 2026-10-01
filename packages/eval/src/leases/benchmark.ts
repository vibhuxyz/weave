import { simulate } from "./engine/index.ts";
import { median, metricsOf, type Metrics } from "./report/index.ts";
import type { BenchmarkRow, SimulationConfig } from "./types.ts";

export interface BenchmarkScenario {
  readonly label: string;
  readonly changes: Partial<SimulationConfig>;
}

export const BENCHMARK_SCENARIOS: readonly BenchmarkScenario[] = [
  { label: "1 worker", changes: { workers: 1 } },
  { label: "5 workers", changes: { workers: 5 } },
  { label: "10 workers", changes: { workers: 10 } },
  { label: "20 workers", changes: { workers: 20 } },
  { label: "20 workers, no faults", changes: { workers: 20, crashRate: 0, hangRate: 0, wrongOutputRate: 0 } },
  { label: "20 workers, 30% crashes", changes: { workers: 20, crashRate: 0.3 } },
  { label: "20 workers, lease 1s", changes: { workers: 20, leaseMs: 1_000, heartbeatMs: 300 } },
  { label: "20 workers, lease 10s", changes: { workers: 20, leaseMs: 10_000, heartbeatMs: 3_000 } },
];

function timedRun(config: SimulationConfig): { readonly metrics: Metrics; readonly wallMs: number } {
  const started = performance.now();
  const metrics = metricsOf(simulate(config));
  return { metrics, wallMs: performance.now() - started };
}

function medianOrNull(values: readonly (number | null)[]): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length === 0 ? null : median(present);
}

function rowOf(scenario: BenchmarkScenario, base: SimulationConfig, runs: number): BenchmarkRow {
  const config = { ...base, ...scenario.changes };
  const results = Array.from({ length: runs }, (_, run) => timedRun({ ...config, seed: `${base.seed}-${run}` }));
  const all = results.map((result) => result.metrics);
  return {
    label: scenario.label,
    runs,
    verifiedShare: median(all.map((metrics) => metrics.verified / config.tasks)),
    makespanMs: median(all.map((metrics) => metrics.makespanMs)),
    throughputPerSecond: median(all.map((metrics) => metrics.throughputPerSecond)),
    recoveryP50Ms: medianOrNull(all.map((metrics) => metrics.recoveryMs?.p50 ?? null)),
    recoveryP95Ms: medianOrNull(all.map((metrics) => metrics.recoveryMs?.p95 ?? null)),
    takeovers: median(all.map((metrics) => metrics.takeovers)),
    fenced: median(all.map((metrics) => metrics.fenced)),
    busyShare: median(all.map((metrics) => metrics.busyShare)),
    wastedShare: median(all.map((metrics) => metrics.wastedShare)),
    violations: all.reduce((sum, metrics) => sum + metrics.violations.length, 0),
    wallMs: median(results.map((result) => result.wallMs)),
  };
}

export function runBenchmark(base: SimulationConfig, runs: number): readonly BenchmarkRow[] {
  return BENCHMARK_SCENARIOS.map((scenario) => rowOf(scenario, base, runs));
}
