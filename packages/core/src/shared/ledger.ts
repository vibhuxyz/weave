import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { WeaveEvent } from "@weave/protocol";

export class Ledger {
  readonly runId: string;
  readonly dir: string;
  readonly file: string;
  private _seq = 0;

  constructor(weaveDir: string, runId: string) {
    this.runId = runId;
    this.dir = join(weaveDir, "runs", runId);
    this.file = join(this.dir, "events.ndjson");
    mkdirSync(this.dir, { recursive: true });
    ensureSelfIgnored(weaveDir);
  }

  get seq(): number {
    return this._seq;
  }

  append<T extends WeaveEvent["type"]>(
    type: T,
    fields: Omit<Extract<WeaveEvent, { type: T }>, "type" | "runId" | "seq" | "at">,
  ): WeaveEvent {
    const event = {
      type,
      runId: this.runId,
      seq: ++this._seq,
      at: new Date().toISOString(),
      ...fields,
    } as unknown as WeaveEvent;
    appendFileSync(this.file, JSON.stringify(event) + "\n");
    return event;
  }

  writeArtifact(name: string, data: unknown): void {
    writeFileSync(join(this.dir, name), JSON.stringify(data, null, 2));
  }
}

export async function readLedger(
  weaveDir: string,
  runId: string,
): Promise<WeaveEvent[]> {
  const file = join(weaveDir, "runs", runId, "events.ndjson");
  const raw = await readFile(file, "utf8");
  return raw
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as WeaveEvent);
}

function ensureSelfIgnored(weaveDir: string): void {
  const marker = join(weaveDir, ".gitignore");
  if (existsSync(marker)) return;
  try {
    mkdirSync(weaveDir, { recursive: true });
    writeFileSync(marker, "*\n");
  } catch {
    return;
  }
}

const RUN_ID_RANDOM_LENGTH = 4;

export function newRunId(): string {
  const isoNow = new Date().toISOString();
  const [date, time] = isoNow.split("T");
  const datePart = date ?? isoNow;
  const timePart = time ?? "";
  const stamp = `${datePart.replaceAll("-", "")}-${timePart.slice(0, 8).replaceAll(":", "")}`;
  const random = Math.random().toString(36).slice(2, 2 + RUN_ID_RANDOM_LENGTH);
  return `${stamp}-${random}`;
}
