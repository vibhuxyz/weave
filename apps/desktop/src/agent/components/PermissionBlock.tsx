import { Badge } from "@/shared/ui/badge";
import type { PermissionBlock as PermissionBlockModel } from "../normalize/types";

export function PermissionBlock({ block }: { block: PermissionBlockModel }) {
  return (
    <section className="rounded-lg border border-border/70 bg-secondary/25 p-4">
      <div className="flex items-center gap-2">
        <Badge variant="secondary">{block.decision ?? "permission"}</Badge>
        <span className="font-medium text-sm">{block.title}</span>
      </div>
      {block.reason && <p className="mt-2 text-muted-foreground text-sm">{block.reason}</p>}
    </section>
  );
}

