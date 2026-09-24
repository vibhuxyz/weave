import { cn } from "@/shared/lib";
import type { EmployeeView } from "../types";

const LABEL: Readonly<Record<EmployeeView["source"], string>> = { builtin: "Built-in", user: "Yours", project: "This project" };

export function SourceBadge({ source, className }: { readonly source: EmployeeView["source"]; readonly className?: string }) {
  return (
    <span className={cn("rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground uppercase tracking-wide", className)}>
      {LABEL[source]}
    </span>
  );
}
