import type { AwakeClock } from "./types.ts";

export function startAwakeClock(nowMs: number): AwakeClock {
  return { awakeMs: 0, lastTickMs: nowMs };
}

export function tickAwakeClock(clock: AwakeClock, nowMs: number, suspendGapMs: number): AwakeClock {
  const stepMs = Math.max(0, nowMs - clock.lastTickMs);
  const awakeStepMs = stepMs >= suspendGapMs ? 0 : stepMs;
  return { awakeMs: clock.awakeMs + awakeStepMs, lastTickMs: nowMs };
}
