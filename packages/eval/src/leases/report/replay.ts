import { setTimeout as sleep } from "node:timers/promises";
import type { SimEvent } from "../types.ts";
import { eventLine } from "./render.ts";

const MAX_PAUSE_MS = 1_000;

export interface ReplayOptions {
  readonly speed: number;
  readonly write: (line: string) => void;
}

export async function replay(events: readonly SimEvent[], options: ReplayOptions): Promise<void> {
  const pausesMs = events.map((event, index) => Math.min(MAX_PAUSE_MS, (event.atMs - (events[index - 1]?.atMs ?? 0)) / options.speed));
  for (const [index, event] of events.entries()) {
    const pauseMs = pausesMs[index] ?? 0;
    if (pauseMs > 0) await sleep(pauseMs);
    options.write(eventLine(event));
  }
}
