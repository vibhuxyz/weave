import { cn } from "@/shared/lib/cn";
import type { EvidenceRow } from "../normalize/types";

export function EvidenceBlock({ rows }: { rows: EvidenceRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-md border border-white/10 bg-[#0f0f14] p-3 font-mono text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      {rows.map((row) => (
        <div key={`${row.label}-${row.value}`} className="flex items-center justify-between gap-4 py-1">
          <span className="truncate text-[#a8a2b3]">{row.label}</span>
          <span
            className={cn(
              "shrink-0",
              row.status === "failed" && "text-[#ff8b8b]",
              row.status === "ok" && "text-[#74e0a3]",
              row.status === "warning" && "text-[#f7b862]",
            )}
          >
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}
