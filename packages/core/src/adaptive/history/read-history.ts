import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { WeaveEvent } from "@weave/protocol";
import { isNotFound, mapBounded } from "../../shared/index.ts";
import { foldRun } from "./fold-run.ts";
import type { RunHistory, SkippedRun } from "./types.ts";

const DEFAULT_MAX_RUNS = 200;
const MAX_LEDGER_BYTES = 20 * 1024 * 1024;
const READ_CONCURRENCY = 8;
const LEDGER_FILE = "events.ndjson";

export interface ReadHistoryOptions {
  readonly maxRuns?: number;
  readonly excludeRunIds?: readonly string[];
}

export interface HistoryRead {
  readonly runs: readonly RunHistory[];
  readonly skipped: readonly SkippedRun[];
}

type RunRead = { readonly ok: true; readonly run: RunHistory } | { readonly ok: false; readonly skipped: SkippedRun };

function parseLines(text: string): WeaveEvent[] {
  return text.split(/\r?\n/).filter((line) => line.trim() !== "").map((line) => JSON.parse(line) as WeaveEvent);
}

async function readRun(path: string): Promise<RunRead> {
  const info = await stat(path).catch((error: unknown) => {
    if (isNotFound(error)) return null;
    throw error;
  });
  if (!info) return { ok: false, skipped: { path, reason: "no ledger file" } };
  if (info.size > MAX_LEDGER_BYTES) return { ok: false, skipped: { path, reason: `ledger is ${info.size} bytes, over ${MAX_LEDGER_BYTES}` } };
  try {
    return { ok: true, run: foldRun(parseLines(await readFile(path, "utf8"))) };
  } catch (error) {
    if (error instanceof SyntaxError) return { ok: false, skipped: { path, reason: `unreadable ledger line: ${error.message}` } };
    throw error;
  }
}

export async function readHistory(weaveDir: string, options: ReadHistoryOptions = {}): Promise<HistoryRead> {
  const runsDir = join(weaveDir, "runs");
  const names = await readdir(runsDir).catch((error: unknown) => {
    if (isNotFound(error)) return [] as string[];
    throw error;
  });
  const excluded = new Set(options.excludeRunIds ?? []);
  const eligible = names.filter((name) => !excluded.has(name)).sort();
  const maxRuns = options.maxRuns ?? DEFAULT_MAX_RUNS;
  const recent = eligible.slice(-maxRuns);
  const tooOld = eligible.slice(0, eligible.length - recent.length).map((name) => ({ path: join(runsDir, name), reason: `older than the ${maxRuns} most recent runs` }));
  const reads = await mapBounded(recent, READ_CONCURRENCY, (name) => readRun(join(runsDir, name, LEDGER_FILE)));
  return {
    runs: reads.flatMap((read) => (read.ok ? [read.run] : [])),
    skipped: [...tooOld, ...reads.flatMap((read) => (read.ok ? [] : [read.skipped]))],
  };
}
