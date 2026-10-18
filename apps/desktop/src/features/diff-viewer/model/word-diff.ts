import { lcsPairs } from "@/agent/diff";
import type { LineSegment } from "@/agent/diff";
import { WORD_DIFF_MAX_LINE_CHARS, WORD_DIFF_MAX_TOKENS, WORD_DIFF_MIN_SIMILARITY } from "../constants";
import { tokenizeWords } from "./tokenize-words";

export interface WordDiff {
  readonly removed: readonly LineSegment[];
  readonly added: readonly LineSegment[];
}

function merge(tokens: readonly string[], unchanged: ReadonlySet<number>): readonly LineSegment[] {
  const segments: LineSegment[] = [];
  tokens.forEach((token, index) => {
    const changed = !unchanged.has(index);
    const last = segments.at(-1);
    if (last && last.changed === changed) segments[segments.length - 1] = { text: last.text + token, changed };
    else segments.push({ text: token, changed });
  });
  return segments;
}

export function wordDiff(oldText: string, newText: string): WordDiff | null {
  if (oldText.length > WORD_DIFF_MAX_LINE_CHARS || newText.length > WORD_DIFF_MAX_LINE_CHARS) return null;
  const oldTokens = tokenizeWords(oldText);
  const newTokens = tokenizeWords(newText);
  if (oldTokens.length > WORD_DIFF_MAX_TOKENS || newTokens.length > WORD_DIFF_MAX_TOKENS) return null;
  if (oldTokens.length === 0 || newTokens.length === 0) return null;

  const pairs = lcsPairs(oldTokens, newTokens);
  const similarity = (2 * pairs.length) / (oldTokens.length + newTokens.length);
  if (similarity < WORD_DIFF_MIN_SIMILARITY) return null;

  const oldKept = new Set(pairs.map(([index]) => index));
  const newKept = new Set(pairs.map(([, index]) => index));
  return { removed: merge(oldTokens, oldKept), added: merge(newTokens, newKept) };
}
