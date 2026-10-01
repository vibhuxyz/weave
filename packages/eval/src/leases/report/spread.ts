import type { Spread } from "./types.ts";

const P50 = 0.5;
const P95 = 0.95;

function percentile(sorted: readonly number[], share: number): number {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(share * sorted.length) - 1));
  return sorted[index] ?? 0;
}

export function spreadOf(values: readonly number[]): Spread | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return { p50: percentile(sorted, P50), p95: percentile(sorted, P95), max: sorted[sorted.length - 1] ?? 0 };
}

export function median(values: readonly number[]): number {
  return spreadOf(values)?.p50 ?? 0;
}
