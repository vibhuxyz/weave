import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { OVERSCAN_ROWS, ROW_HEIGHT_PX, VIRTUALIZE_ROW_THRESHOLD } from "../../constants";
import type { LineTokens } from "../../hooks";
import { ContextExpander } from "./ContextExpander";
import { DiffLineRow } from "./DiffLineRow";
import { rowKey, type FileRow } from "./file-rows";

function RowView({
  row,
  tokens,
  onExpand,
}: {
  readonly row: FileRow;
  readonly tokens: LineTokens;
  readonly onExpand: (key: string, direction: "up" | "down") => void;
}) {
  if (row.kind === "gap") {
    return (
      <ContextExpander
        remaining={row.gap.remaining}
        onExpandUp={() => onExpand(row.gap.key, "up")}
        onExpandDown={() => onExpand(row.gap.key, "down")}
      />
    );
  }
  if (row.kind === "context") return <DiffLineRow line={row.line} />;
  return <DiffLineRow line={row.line} tokens={tokens.tokensFor(row.tokenRow, row.line.kind)} />;
}

export function FileRows({
  rows,
  tokens,
  onExpand,
}: {
  readonly rows: readonly FileRow[];
  readonly tokens: LineTokens;
  readonly onExpand: (key: string, direction: "up" | "down") => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isVirtual = rows.length > VIRTUALIZE_ROW_THRESHOLD;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: OVERSCAN_ROWS,
    enabled: isVirtual,
  });

  if (!isVirtual) {
    return (
      <div>
        {rows.map((row, index) => (
          <RowView key={rowKey(row, index)} row={row} tokens={tokens} onExpand={onExpand} />
        ))}
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="max-h-[60vh] overflow-y-auto overscroll-contain">
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          const row = rows[item.index];
          if (!row) return null;
          return (
            <div
              key={rowKey(row, item.index)}
              ref={virtualizer.measureElement}
              data-index={item.index}
              className="absolute top-0 left-0 w-full"
              style={{ transform: `translateY(${String(item.start)}px)` }}
            >
              <RowView row={row} tokens={tokens} onExpand={onExpand} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
