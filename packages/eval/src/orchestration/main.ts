import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { renderReport, runBenchmark } from "./index.ts";

const { values } = parseArgs({
  options: {
    seed: { type: "string", default: "weave" },
    train: { type: "string", default: "30" },
    test: { type: "string", default: "20" },
    workers: { type: "string", default: "4" },
    "ms-per-unit": { type: "string", default: "25" },
  },
});

function positive(name: string, raw: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new Error(`--${name} must be a positive integer, got ${raw}`);
  return value;
}

const workDir = await mkdtemp(join(tmpdir(), "weave-orchestration-bench-"));
try {
  const result = await runBenchmark({
    seed: values.seed,
    trainCount: positive("train", values.train),
    testCount: positive("test", values.test),
    maxWorkers: positive("workers", values.workers),
    msPerUnit: positive("ms-per-unit", values["ms-per-unit"]),
    workDir,
  });
  process.stdout.write(`${renderReport(result.comparison, result)}\n`);
  process.exitCode = result.comparison.verdict === "improved" ? 0 : 1;
} finally {
  await rm(workDir, { recursive: true, force: true });
}
