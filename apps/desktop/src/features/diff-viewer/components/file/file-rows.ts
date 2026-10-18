import type { DiffHunk, DiffLine } from "@/agent/diff";
import type { GapView } from "../../hooks";

export type FileRow =
  | { readonly kind: "line"; readonly line: DiffLine; readonly tokenRow: number }
  | { readonly kind: "context"; readonly line: DiffLine }
  | { readonly kind: "gap"; readonly gap: GapView };

export function buildRows(
  hunks: readonly DiffHunk[],
  gapFor: (hunk: DiffHunk, index: number) => GapView | null,
): readonly FileRow[] {
  const rows: FileRow[] = [];
  let tokenRow = 0;
  hunks.forEach((hunk, index) => {
    const gap = gapFor(hunk, index);
    if (gap) {
      for (const line of gap.before) rows.push({ kind: "context", line });
      if (gap.remaining > 0) rows.push({ kind: "gap", gap });
      for (const line of gap.after) rows.push({ kind: "context", line });
    }
    for (const line of hunk.lines) {
      rows.push({ kind: "line", line, tokenRow });
      tokenRow += 1;
    }
  });
  return rows;
}

export function rowKey(row: FileRow, index: number): string {
  if (row.kind === "gap") return `gap:${row.gap.key}`;
  return `${row.kind}:${String(index)}`;
}
