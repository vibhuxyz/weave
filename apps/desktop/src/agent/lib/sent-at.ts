const JUST_NOW_MS = 45_000;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export type SentAgo =
  | { readonly unit: "just-now" }
  | { readonly unit: "minute" | "hour"; readonly count: number }
  | { readonly unit: "date" };

export function sentAgo(createdAtMs: number, nowMs: number): SentAgo {
  const ageMs = Math.max(0, nowMs - createdAtMs);
  if (ageMs < JUST_NOW_MS) return { unit: "just-now" };
  if (ageMs < HOUR_MS) return { unit: "minute", count: Math.max(1, Math.round(ageMs / MINUTE_MS)) };
  if (ageMs < DAY_MS) return { unit: "hour", count: Math.round(ageMs / HOUR_MS) };
  return { unit: "date" };
}
