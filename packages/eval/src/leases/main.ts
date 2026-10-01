import { runBenchmark } from "./benchmark.ts";
import { parseCliOptions, USAGE, type CliMode } from "./cli-options.ts";
import { simulate } from "./engine/index.ts";
import { metricsOf, renderBenchmark, renderReport, replay } from "./report/index.ts";

const EXIT_BROKEN_INVARIANT = 1;
const EXIT_BAD_OPTIONS = 2;

function write(text: string): void {
  process.stdout.write(`${text}\n`);
}

async function runSimulation(mode: Extract<CliMode, { readonly kind: "simulate" }>): Promise<number> {
  const started = performance.now();
  const result = simulate(mode.config);
  const wallMs = performance.now() - started;
  const metrics = metricsOf(result);
  if (mode.replaySpeed !== null) {
    write(`Replaying ${result.events.length} events at ${mode.replaySpeed}x…\n`);
    await replay(result.events, { speed: mode.replaySpeed, write });
    write("");
  }
  write(renderReport({ result, metrics, wallMs, shouldShowTimeline: mode.shouldShowTimeline }));
  return metrics.violations.length === 0 ? 0 : EXIT_BROKEN_INVARIANT;
}

function runBench(mode: Extract<CliMode, { readonly kind: "bench" }>): number {
  const rows = runBenchmark(mode.config, mode.runs);
  write(renderBenchmark(rows, mode.config));
  return rows.some((row) => row.violations > 0) ? EXIT_BROKEN_INVARIANT : 0;
}

async function main(args: readonly string[]): Promise<number> {
  const parsed = parseCliOptions(args);
  if (!parsed.ok) {
    process.stderr.write(`${parsed.reason}\n\n${USAGE}\n`);
    return EXIT_BAD_OPTIONS;
  }
  const { mode } = parsed;
  switch (mode.kind) {
    case "help":
      write(USAGE);
      return 0;
    case "simulate":
      return runSimulation(mode);
    case "bench":
      return runBench(mode);
    default: {
      const unreachable: never = mode;
      return unreachable;
    }
  }
}

process.exitCode = await main(process.argv.slice(2));
