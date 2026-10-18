import type { ThemedToken } from "shiki";
import type { LineSegment } from "@/agent/diff";

export interface Span {
  readonly text: string;
  readonly color?: string;
  readonly fontStyle?: number;
  readonly changed: boolean;
}

interface Piece {
  readonly end: number;
  readonly color?: string;
  readonly fontStyle?: number;
}

const DARK_COLOR_VAR = "--shiki-dark";

function colorOf(token: ThemedToken): string | undefined {
  if (token.color) return token.color;
  const style = token.htmlStyle;
  if (!style) return undefined;
  return style[DARK_COLOR_VAR] ?? style["color"];
}

function tokenPieces(tokens: readonly ThemedToken[] | undefined, length: number): readonly Piece[] {
  if (!tokens || tokens.length === 0) return [{ end: length }];
  const pieces: Piece[] = [];
  let at = 0;
  for (const token of tokens) {
    at += token.content.length;
    pieces.push({ end: at, color: colorOf(token), fontStyle: token.fontStyle });
  }
  if (at < length) pieces.push({ end: length });
  return pieces;
}

function segmentPieces(segments: readonly LineSegment[] | undefined, length: number): readonly { end: number; changed: boolean }[] {
  if (!segments || segments.length === 0) return [{ end: length, changed: false }];
  const pieces: { end: number; changed: boolean }[] = [];
  let at = 0;
  for (const segment of segments) {
    at += segment.text.length;
    pieces.push({ end: at, changed: segment.changed });
  }
  if (at < length) pieces.push({ end: length, changed: false });
  return pieces;
}

export function mergeSpans(
  text: string,
  tokens: readonly ThemedToken[] | undefined,
  segments: readonly LineSegment[] | undefined,
): readonly Span[] {
  const styles = tokenPieces(tokens, text.length);
  const marks = segmentPieces(segments, text.length);
  const spans: Span[] = [];
  let at = 0;
  let styleAt = 0;
  let markAt = 0;
  while (at < text.length) {
    const style = styles[styleAt];
    const mark = marks[markAt];
    if (!style || !mark) break;
    const end = Math.min(style.end, mark.end);
    if (end > at) {
      spans.push({
        text: text.slice(at, end),
        ...(style.color ? { color: style.color } : {}),
        ...(style.fontStyle ? { fontStyle: style.fontStyle } : {}),
        changed: mark.changed,
      });
    }
    at = end;
    if (style.end <= at) styleAt += 1;
    if (mark.end <= at) markAt += 1;
  }
  return spans;
}
