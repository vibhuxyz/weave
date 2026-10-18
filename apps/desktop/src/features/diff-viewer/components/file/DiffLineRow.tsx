import { memo } from "react";
import type { ThemedToken } from "shiki";
import type { DiffLine } from "@/agent/diff";
import { cn } from "@/shared/lib";
import { LineContent } from "./LineContent";

const ROW_BG: Readonly<Record<DiffLine["kind"], string>> = {
  add: "bg-diff-add-row",
  del: "bg-diff-del-row",
  context: "",
};

const MARKER: Readonly<Record<DiffLine["kind"], string>> = {
  add: "+",
  del: "−",
  context: " ",
};

const MARKER_FG: Readonly<Record<DiffLine["kind"], string>> = {
  add: "text-diff-add-marker",
  del: "text-diff-del-marker",
  context: "text-diff-gutter-fg",
};

export const DiffLineRow = memo(function DiffLineRow({
  line,
  tokens,
}: {
  readonly line: DiffLine;
  readonly tokens?: readonly ThemedToken[];
}) {
  const number = line.kind === "del" ? line.oldLine : line.newLine;
  return (
    <div
      className={cn(
        "flex items-start gap-2 px-2 font-mono text-[11px] leading-[1.6] hover:bg-diff-row-hover",
        ROW_BG[line.kind],
      )}
    >
      <span className="w-10 shrink-0 select-none text-right text-diff-gutter-fg tabular-nums">
        {number ?? ""}
      </span>
      <span className={cn("w-2 shrink-0 select-none", MARKER_FG[line.kind])}>{MARKER[line.kind]}</span>
      <LineContent line={line} tokens={tokens} />
    </div>
  );
});
