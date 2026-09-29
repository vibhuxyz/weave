#!/usr/bin/env node
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { diagnoseRun, readLedger, renderDiagnosis } from "../packages/core/src/index.ts";

const WEAVE_DIR = process.env.WEAVE_DIR ?? join(process.cwd(), ".weave");

async function latestRunId() {
  const runs = await readdir(join(WEAVE_DIR, "runs"), { withFileTypes: true }).catch(() => []);
  const ids = runs.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  return ids.at(-1) ?? null;
}

const runId = process.argv[2] ?? (await latestRunId());
if (!runId) {
  console.error(`No runs found in ${WEAVE_DIR}/runs. Pass a run id, or set WEAVE_DIR to the project you ran.`);
  process.exit(1);
}

const events = await readLedger(WEAVE_DIR, runId).catch((error) => {
  console.error(`Cannot read the ledger for ${runId}: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

console.log(renderDiagnosis(diagnoseRun(events)));
