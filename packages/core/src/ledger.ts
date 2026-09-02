import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { BerdEvent } from "@berd/protocol";

/**
 * Append-only execution ledger: `.berd/runs/<runId>/events.ndjson`.
 *
 * One JSON object per line, never rewritten. This is the source of truth for
 * replay, cost accounting, and "why did agent 4 touch that file". Making it
 * optional would mean losing the answer to questions not yet asked, so it
 * always writes.
 *
 * Writes are synchronous on purpose. An async queue can drop its tail when the
 * process exits or crashes — exactly the runs whose logs matter most.
 */
export class Ledger {
  readonly runId: string;
  readonly dir: string;
  readonly file: string;
  private seq = 0;

  constructor(berdDir: string, runId: string) {
    this.runId = runId;
    this.dir = join(berdDir, "runs", runId);
    this.file = join(this.dir, "events.ndjson");
    mkdirSync(this.dir, { recursive: true });
    ensureSelfIgnored(berdDir);
  }

  /** Append one event. Returns it with `runId`/`seq`/`at` filled in. */
  append<T extends BerdEvent["type"]>(
    type: T,
    fields: Omit<Extract<BerdEvent, { type: T }>, "type" | "runId" | "seq" | "at">,
  ): BerdEvent {
    // The signature above is what enforces correctness: callers must pass the
    // exact fields for the `type` they name. TypeScript cannot see that the
    // reconstructed object narrows back to one union member, so the cast is
    // internal only — it buys nothing at the call site and hides nothing.
    const event = {
      type,
      runId: this.runId,
      seq: ++this.seq,
      at: new Date().toISOString(),
      ...fields,
    } as unknown as BerdEvent;
    appendFileSync(this.file, JSON.stringify(event) + "\n");
    return event;
  }

  /** Write a sidecar next to the events, e.g. `metrics.json`. */
  writeArtifact(name: string, data: unknown): void {
    appendFileSync(join(this.dir, name), JSON.stringify(data, null, 2));
  }
}

/** Read a run's events back in order. */
export async function readLedger(
  berdDir: string,
  runId: string,
): Promise<BerdEvent[]> {
  const file = join(berdDir, "runs", runId, "events.ndjson");
  const raw = await readFile(file, "utf8");
  return raw
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as BerdEvent);
}

/**
 * Make `.berd/` invisible to git without touching the target repo's config.
 *
 * `.berd/` sits inside the project being worked on, so without this every run
 * shows up as an untracked change — polluting `filesChanged`, the desktop's
 * Changes panel, and any diff the agent is asked to review. A `.gitignore`
 * containing `*` inside the directory ignores the directory and itself.
 */
function ensureSelfIgnored(berdDir: string): void {
  const marker = join(berdDir, ".gitignore");
  if (existsSync(marker)) return;
  try {
    mkdirSync(berdDir, { recursive: true });
    writeFileSync(marker, "*\n");
  } catch {
    // Not fatal: worst case the runtime dir shows as untracked.
  }
}

/** `20260902-231500-a1b2` — sorts chronologically, safe as a directory name. */
export function newRunId(): string {
  // 2026-09-02T18:17:46.123Z → 20260902-181746
  const [date, time] = new Date().toISOString().split("T");
  const stamp = `${date.replaceAll("-", "")}-${time.slice(0, 8).replaceAll(":", "")}`;
  return `${stamp}-${Math.random().toString(36).slice(2, 6)}`;
}
