import { memo } from "react";
import type { CSSProperties } from "react";
import type { ThemedToken } from "shiki";
import type { DiffLine } from "@/agent/diff";
import { cn } from "@/shared/lib";
import { mergeSpans } from "../../model";

const FONT_STYLE_COUNT = 8;

const FONT_STYLES: readonly CSSProperties[] = [
  {},
  { fontStyle: "italic" },
  { fontWeight: "bold" },
  { fontStyle: "italic", fontWeight: "bold" },
  { textDecoration: "underline" },
  { fontStyle: "italic", textDecoration: "underline" },
  { fontWeight: "bold", textDecoration: "underline" },
  { fontStyle: "italic", fontWeight: "bold", textDecoration: "underline" },
];

function styleOf(color: string | undefined, fontStyle: number | undefined): CSSProperties {
  const index = fontStyle !== undefined && fontStyle > 0 ? fontStyle % FONT_STYLE_COUNT : 0;
  return { ...FONT_STYLES[index], ...(color ? { color } : {}) };
}

export const LineContent = memo(function LineContent({
  line,
  tokens,
}: {
  readonly line: DiffLine;
  readonly tokens?: readonly ThemedToken[];
}) {
  if (line.text === "") return <span className="whitespace-pre-wrap"> </span>;
  const spans = mergeSpans(line.text, tokens, line.segments);
  const wordClass = line.kind === "add" ? "bg-diff-add-word" : "bg-diff-del-word";
  return (
    <span className="whitespace-pre-wrap break-words text-agent-text">
      {spans.map((span, index) => (
        <span
          key={index}
          className={cn("rounded-[2px]", span.changed && wordClass)}
          style={styleOf(span.color, span.fontStyle)}
        >
          {span.text}
        </span>
      ))}
    </span>
  );
});
