import { useCallback, useEffect, useMemo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import type { DiffHunk, DiffLine } from "@/agent/diff";
import type { DiffChannel } from "../api";
import { CONTEXT_EXPAND_STEP } from "../constants";
import { contextRev } from "../model";
import { useDiffViewerStore } from "../store";
import type { DiffSource, Expansion } from "../types";

export interface GapView {
  readonly key: string;
  readonly remaining: number;
  readonly before: readonly DiffLine[];
  readonly after: readonly DiffLine[];
}

interface Range {
  readonly from: number;
  readonly to: number;
}

const NO_LINES: readonly DiffLine[] = [];
const NO_EXPANSION: Expansion = { up: 0, down: 0 };

export function gapKey(path: string, hunkIndex: number): string {
  return `${path}#${String(hunkIndex)}`;
}

function gapBounds(hunk: DiffHunk): Range | null {
  const size = hunk.skippedBefore ?? 0;
  if (size <= 0) return null;
  return { from: hunk.newStart - size, to: hunk.newStart - 1 };
}

function toLines(texts: readonly string[], firstLine: number): readonly DiffLine[] {
  return texts.map((text, offset) => ({
    kind: "context" as const,
    oldLine: firstLine + offset,
    newLine: firstLine + offset,
    text,
  }));
}

export function useHunkContext(path: string, hunks: readonly DiffHunk[], source: DiffSource, channel: DiffChannel) {
  const { expansions, contextLines } = useDiffViewerStore(
    useShallow((state) => ({ expansions: state.expansions, contextLines: state.contextLines })),
  );
  const requested = useRef(new Set<string>());
  const rev = useMemo(() => contextRev(source), [source]);

  const wanted = useMemo(() => {
    const ranges: Array<{ readonly key: string; readonly range: Range }> = [];
    hunks.forEach((hunk, index) => {
      const bounds = gapBounds(hunk);
      if (!bounds) return;
      const { up, down } = expansions.get(gapKey(path, index)) ?? NO_EXPANSION;
      if (down > 0) ranges.push({ key: `${path}@${String(bounds.from)}`, range: { from: bounds.from, to: Math.min(bounds.from + down - 1, bounds.to) } });
      if (up > 0) {
        const from = Math.max(bounds.to - up + 1, bounds.from);
        ranges.push({ key: `${path}@${String(from)}`, range: { from, to: bounds.to } });
      }
    });
    return ranges;
  }, [expansions, hunks, path]);

  useEffect(() => {
    for (const { key, range } of wanted) {
      const token = `${key}:${String(range.to)}`;
      if (requested.current.has(token)) continue;
      requested.current.add(token);
      channel.requestContext(path, rev, range.from, range.to);
    }
  }, [channel, path, rev, wanted]);

  const gapFor = useCallback(
    (hunk: DiffHunk, index: number): GapView | null => {
      const bounds = gapBounds(hunk);
      if (!bounds) return null;
      const key = gapKey(path, index);
      const size = hunk.skippedBefore ?? 0;
      const { up, down } = expansions.get(key) ?? NO_EXPANSION;
      const shownDown = Math.min(down, size);
      const shownUp = Math.min(up, size - shownDown);
      const downText = contextLines.get(`${path}@${String(bounds.from)}`);
      const upFrom = Math.max(bounds.to - shownUp + 1, bounds.from);
      const upText = contextLines.get(`${path}@${String(upFrom)}`);
      return {
        key,
        remaining: size - shownDown - shownUp,
        before: shownDown > 0 && downText ? toLines(downText.slice(0, shownDown), bounds.from) : NO_LINES,
        after: shownUp > 0 && upText ? toLines(upText.slice(-shownUp), upFrom) : NO_LINES,
      };
    },
    [contextLines, expansions, path],
  );

  const expand = useCallback((key: string, direction: "up" | "down") => {
    useDiffViewerStore.getState().expand(key, direction, CONTEXT_EXPAND_STEP);
  }, []);

  return { gapFor, expand };
}
