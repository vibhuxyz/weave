import {
  DEFAULT_AUTO_COMPACT_THRESHOLD,
  MAX_AUTO_COMPACT_THRESHOLD_PERCENT,
  MIN_AUTO_COMPACT_THRESHOLD_PERCENT,
  PERCENT_SCALE,
} from "./constants";

const DISABLED_THRESHOLD = 1;
const THRESHOLD_PATTERN = /^\s*(\d+(?:\.\d+)?)\s*$/;

function isEnabledThreshold(threshold: number): boolean {
  return threshold > 0 && threshold < DISABLED_THRESHOLD;
}

export function parseAutoCompactThreshold(raw: string | null): number {
  const match = raw === null ? null : THRESHOLD_PATTERN.exec(raw);
  const digits = match?.[1];
  if (digits === undefined) return DEFAULT_AUTO_COMPACT_THRESHOLD;
  const parsed = Number.parseFloat(digits);
  if (!Number.isFinite(parsed)) return DEFAULT_AUTO_COMPACT_THRESHOLD;
  return isEnabledThreshold(parsed) ? parsed : DISABLED_THRESHOLD;
}

export function clampThresholdPercent(percent: number): number {
  if (!Number.isFinite(percent)) {
    return Math.round(DEFAULT_AUTO_COMPACT_THRESHOLD * PERCENT_SCALE);
  }
  return Math.max(
    MIN_AUTO_COMPACT_THRESHOLD_PERCENT,
    Math.min(MAX_AUTO_COMPACT_THRESHOLD_PERCENT, Math.round(percent)),
  );
}

export function thresholdToPercent(threshold: number): number {
  if (!isEnabledThreshold(threshold)) return MAX_AUTO_COMPACT_THRESHOLD_PERCENT;
  return clampThresholdPercent(threshold * PERCENT_SCALE);
}

export function percentToThreshold(percent: number): number {
  return clampThresholdPercent(percent) / PERCENT_SCALE;
}

export function isAutoCompactOff(percent: number): boolean {
  return percent >= MAX_AUTO_COMPACT_THRESHOLD_PERCENT;
}
