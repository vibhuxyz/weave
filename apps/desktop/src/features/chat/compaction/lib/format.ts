import { PERCENT_SCALE } from "./constants";

const PRECISE_COMPACT_BELOW = 10_000;
const MS_PER_SECOND = 1_000;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PAD = 2;

const EXACT_FORMAT = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const COMPACT_ONE_DECIMAL = new Intl.NumberFormat(undefined, {
  notation: "compact",
  compactDisplay: "short",
  maximumFractionDigits: 1,
});
const COMPACT_WHOLE = new Intl.NumberFormat(undefined, {
  notation: "compact",
  compactDisplay: "short",
  maximumFractionDigits: 0,
});

export function formatExactTokenCount(count: number): string {
  return EXACT_FORMAT.format(count);
}

export function formatCompactTokenCount(count: number): string {
  return (count < PRECISE_COMPACT_BELOW ? COMPACT_ONE_DECIMAL : COMPACT_WHOLE).format(count);
}

export function formatDuration(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / MS_PER_SECOND));
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(SECONDS_PAD, "0")}s`;
}

export const TEXT_BAR_CELLS = 32;
export const SWEEP_SEGMENT_CELLS = 9;

export type BarTone = "solid" | "faded" | "empty";

export interface BarRun {
  readonly tone: BarTone;
  readonly text: string;
}

const GLYPHS = { solid: "█", faded: "░", empty: "░", sweep: "━" } as const;

function run(tone: BarTone, glyph: string, cells: number): BarRun[] {
  return cells > 0 ? [{ tone, text: glyph.repeat(cells) }] : [];
}

function cellsFor(percent: number): number {
  return Math.min(TEXT_BAR_CELLS, Math.max(0, Math.round((percent / PERCENT_SCALE) * TEXT_BAR_CELLS)));
}

export function sweepBarRuns(position: number): BarRun[] {
  const start = Math.min(Math.max(0, position), TEXT_BAR_CELLS - SWEEP_SEGMENT_CELLS);
  return [
    ...run("empty", GLYPHS.empty, start),
    ...run("solid", GLYPHS.sweep, SWEEP_SEGMENT_CELLS),
    ...run("empty", GLYPHS.empty, TEXT_BAR_CELLS - start - SWEEP_SEGMENT_CELLS),
  ];
}

export function resultBarRuns(beforePercent: number, afterPercent: number): BarRun[] {
  const after = cellsFor(afterPercent);
  const before = Math.max(after, cellsFor(beforePercent));
  return [
    ...run("solid", GLYPHS.solid, after),
    ...run("faded", GLYPHS.faded, before - after),
    ...run("empty", GLYPHS.empty, TEXT_BAR_CELLS - before),
  ];
}

export function nextSweepPosition(position: number, direction: 1 | -1): { position: number; direction: 1 | -1 } {
  const last = TEXT_BAR_CELLS - SWEEP_SEGMENT_CELLS;
  const next = position + direction;
  if (next > last) return { position: last - 1, direction: -1 };
  if (next < 0) return { position: 1, direction: 1 };
  return { position: next, direction };
}
