import type { Ledger } from "../shared/index.ts";

export interface HeartbeatWatch {
  readonly beat: () => void;
  readonly silentMs: (atMs: number) => number;
  readonly stop: () => void;
}

export interface HeartbeatOptions {
  readonly ledger: Ledger;
  readonly taskId: string;
  readonly now: () => number;
}

export function watchHeartbeat(options: HeartbeatOptions): HeartbeatWatch {
  let lastBeat = options.now();
  const beat = () => {
    lastBeat = options.now();
  };
  const unsubscribe = options.ledger.subscribe((event) => {
    if (event.taskId === options.taskId) beat();
  });
  return {
    beat,
    silentMs: (atMs: number) => atMs - lastBeat,
    stop: unsubscribe,
  };
}
