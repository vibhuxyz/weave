import { useEffect, useMemo, useState } from "react";
import type { ThemedToken } from "shiki";
import type { BundledLanguage } from "shiki";
import type { DiffLine } from "@/agent/diff";
import { PLAIN_LANGUAGE, languageOf } from "@/shared/lib";
import { highlightCode, type TokenizedCode } from "@/shared/ui/ai-elements";
import { HIGHLIGHT_MAX_BYTES, HIGHLIGHT_MAX_LINES } from "../constants";
import { sideTexts } from "../model";

interface Sides {
  readonly old: TokenizedCode | null;
  readonly next: TokenizedCode | null;
}

const NO_SIDES: Sides = { old: null, next: null };

export interface LineTokens {
  readonly tokensFor: (row: number, kind: DiffLine["kind"]) => readonly ThemedToken[] | undefined;
}

function tooBig(text: string, lineCount: number): boolean {
  return text.length > HIGHLIGHT_MAX_BYTES || lineCount > HIGHLIGHT_MAX_LINES;
}

export function useLineTokens(path: string, lines: readonly DiffLine[], enabled: boolean): LineTokens {
  const sides = useMemo(() => sideTexts(lines), [lines]);
  const language = useMemo(() => languageOf(path), [path]);
  const [tokenized, setTokenized] = useState<Sides>(NO_SIDES);

  useEffect(() => {
    if (!enabled || language === PLAIN_LANGUAGE) {
      setTokenized(NO_SIDES);
      return;
    }
    if (tooBig(sides.oldText, lines.length) || tooBig(sides.newText, lines.length)) {
      setTokenized(NO_SIDES);
      return;
    }
    let isCurrent = true;
    const lang = language as BundledLanguage;
    const seed: Sides = {
      old: highlightCode(sides.oldText, lang, (result) => {
        if (isCurrent) setTokenized((prev) => ({ ...prev, old: result }));
      }),
      next: highlightCode(sides.newText, lang, (result) => {
        if (isCurrent) setTokenized((prev) => ({ ...prev, next: result }));
      }),
    };
    setTokenized(seed);
    return () => {
      isCurrent = false;
    };
  }, [enabled, language, lines.length, sides]);

  return useMemo(
    () => ({
      tokensFor: (row, kind) => {
        const index = kind === "del" ? sides.oldIndex[row] : sides.newIndex[row];
        if (index === undefined || index < 0) return undefined;
        const source = kind === "del" ? tokenized.old : tokenized.next;
        return source?.tokens[index];
      },
    }),
    [sides, tokenized],
  );
}
