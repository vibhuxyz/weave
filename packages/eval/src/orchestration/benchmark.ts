import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { buildStats, readHistory, type HistoryStats } from "@weave/core";
import { adaptivePolicy, baselinePolicy, explorationPolicy } from "./policies.ts";
import { runScenario } from "./run-scenario.ts";
import { SIM_ENGINES, generateScenarios, plannedTasks, simWorld, type Scenario, type World } from "./sim/index.ts";
import { compareRuns } from "./summarize.ts";
import type { Comparison, ScenarioRun } from "./types.ts";

export interface BenchmarkOptions {
  readonly seed: string;
  readonly trainCount: number;
  readonly testCount: number;
  readonly maxWorkers: number;
  readonly msPerUnit: number;
  readonly workDir: string;
}

export interface BenchmarkResult {
  readonly stats: HistoryStats;
  readonly baseline: readonly ScenarioRun[];
  readonly adaptive: readonly ScenarioRun[];
  readonly comparison: Comparison;
}

const CONFIGURED_ENGINES: readonly string[] = SIM_ENGINES.map((engine) => engine.id);

async function train(options: BenchmarkOptions, world: World, historyDir: string): Promise<HistoryStats> {
  for (const scenario of generateScenarios(`${options.seed}-train`, options.trainCount)) {
    const policy = explorationPolicy(plannedTasks(scenario.tasks), CONFIGURED_ENGINES, { maxWorkers: options.maxWorkers, salt: scenario.id });
    await runScenario({ scenario, world, policy, weaveDir: historyDir, scratchDir: options.workDir });
  }
  return buildStats((await readHistory(historyDir)).runs);
}

async function evaluate(options: BenchmarkOptions, world: World, scenario: Scenario, stats: HistoryStats, isAdaptiveFirst: boolean): Promise<readonly [ScenarioRun, ScenarioRun]> {
  const tasks = plannedTasks(scenario.tasks);
  const runBaseline = () => runScenario({ scenario, world, policy: baselinePolicy(tasks, CONFIGURED_ENGINES, options.maxWorkers), weaveDir: join(options.workDir, "eval-baseline"), scratchDir: options.workDir });
  const runAdaptive = () => runScenario({ scenario, world, policy: adaptivePolicy(tasks, CONFIGURED_ENGINES, { maxWorkers: options.maxWorkers, stats }), weaveDir: join(options.workDir, "eval-adaptive"), scratchDir: options.workDir });
  if (isAdaptiveFirst) {
    const adaptive = await runAdaptive();
    return [await runBaseline(), adaptive];
  }
  const baseline = await runBaseline();
  return [baseline, await runAdaptive()];
}

export async function runBenchmark(options: BenchmarkOptions): Promise<BenchmarkResult> {
  await mkdir(options.workDir, { recursive: true });
  const world = simWorld(options.seed, options.msPerUnit);
  const stats = await train(options, world, join(options.workDir, "history"));
  const baseline: ScenarioRun[] = [];
  const adaptive: ScenarioRun[] = [];
  for (const [index, scenario] of generateScenarios(`${options.seed}-test`, options.testCount).entries()) {
    const [baselineRun, adaptiveRun] = await evaluate(options, world, scenario, stats, index % 2 === 1);
    baseline.push(baselineRun);
    adaptive.push(adaptiveRun);
  }
  return { stats, baseline, adaptive, comparison: compareRuns(baseline, adaptive) };
}
