import { useEffect, useMemo, useState } from "react";
import type { BundledLanguage, ThemedToken } from "shiki";
import { PLAIN_LANGUAGE, languageOf } from "@/shared/lib";
import { highlightCode, type TokenizedCode } from "@/shared/ui/ai-elements";
import { HIGHLIGHT_MAX_BYTES, HIGHLIGHT_MAX_LINES } from "../../constants";
import { LineContent } from "../file/LineContent";

export function PlainCode({ content, path }: { readonly content: string; readonly path: string }) {
  const lines = useMemo(() => content.split(/\r?\n/), [content]);
  const language = useMemo(() => languageOf(path), [path]);
  const [tokenized, setTokenized] = useState<TokenizedCode | null>(null);

  useEffect(() => {
    if (language === PLAIN_LANGUAGE || content.length > HIGHLIGHT_MAX_BYTES || lines.length > HIGHLIGHT_MAX_LINES) {
      setTokenized(null);
      return;
    }
    let isCurrent = true;
    setTokenized(
      highlightCode(content, language as BundledLanguage, (result) => {
        if (isCurrent) setTokenized(result);
      }),
    );
    return () => {
      isCurrent = false;
    };
  }, [content, language, lines.length]);

  return (
    <div className="min-w-0 font-mono text-[11px] leading-[1.6]">
      {lines.map((text, index) => (
        <div key={index} className="flex items-start gap-2 px-2 hover:bg-diff-row-hover">
          <span className="w-12 shrink-0 select-none text-right text-diff-gutter-fg tabular-nums">{index + 1}</span>
          <LineContent
            line={{ kind: "context", oldLine: index + 1, newLine: index + 1, text }}
            tokens={tokenized?.tokens[index] as readonly ThemedToken[] | undefined}
          />
        </div>
      ))}
    </div>
  );
}
