import {
  ANSI_ESCAPE,
  DEFAULT_MAX_CHARS,
  HEAD_LINES,
  MAX_LINE_CHARS,
  MAX_SIGNAL_LINES,
  SIGNAL_LINE,
  TAIL_LINES,
} from "./constants.ts";

function lastRedraw(line: string): string {
  const segments = line.split("\r");
  return segments[segments.length - 1] ?? "";
}

function cleanLines(text: string): readonly string[] {
  return text
    .replace(ANSI_ESCAPE, "")
    .split(/\r?\n/)
    .map((line) => lastRedraw(line).trimEnd())
    .map((line) => (line.length > MAX_LINE_CHARS ? `${line.slice(0, MAX_LINE_CHARS)}…` : line));
}

function collapseRepeats(lines: readonly string[]): readonly string[] {
  const collapsed: string[] = [];
  let previous: string | null = null;
  let count = 0;
  const flush = () => {
    if (previous !== null) collapsed.push(count > 1 ? `${previous} (×${count})` : previous);
  };
  for (const line of lines) {
    if (line === previous) {
      count += 1;
      continue;
    }
    flush();
    previous = line;
    count = 1;
  }
  flush();
  return collapsed.filter((line) => line.trim().length > 0);
}

function keptIndexes(lines: readonly string[]): readonly number[] {
  const head = lines.slice(0, HEAD_LINES).map((_, index) => index);
  const tailStart = Math.max(HEAD_LINES, lines.length - TAIL_LINES);
  const tail = lines.slice(tailStart).map((_, offset) => tailStart + offset);
  const signals = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line, index }) => index >= HEAD_LINES && index < tailStart && SIGNAL_LINE.test(line))
    .slice(0, MAX_SIGNAL_LINES)
    .map(({ index }) => index);
  return [...new Set([...head, ...signals, ...tail])].sort((left, right) => left - right);
}

function withGapMarkers(lines: readonly string[], indexes: readonly number[]): string {
  const parts: string[] = [];
  let expected = 0;
  for (const index of indexes) {
    if (index > expected) parts.push(`… ${index - expected} line(s) omitted …`);
    parts.push(lines[index] ?? "");
    expected = index + 1;
  }
  if (lines.length > expected) parts.push(`… ${lines.length - expected} line(s) omitted …`);
  return parts.join("\n");
}

function hardCap(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const marker = "\n… output truncated …\n";
  if (maxChars <= marker.length) return text.slice(0, Math.max(0, maxChars));
  const room = maxChars - marker.length;
  const headChars = Math.floor(room / 3);
  return `${text.slice(0, headChars)}${marker}${text.slice(text.length - (room - headChars))}`;
}

export function compressToolOutput(text: string, maxChars: number = DEFAULT_MAX_CHARS): string {
  const lines = collapseRepeats(cleanLines(text));
  const joined = lines.join("\n");
  if (joined.length <= maxChars) return joined;
  return hardCap(withGapMarkers(lines, keptIndexes(lines)), maxChars);
}
