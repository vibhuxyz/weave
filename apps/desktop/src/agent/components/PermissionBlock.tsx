import { Badge } from "@/shared/ui/badge";
import type { PermissionBlock as PermissionBlockModel } from "../normalize/types";

export function PermissionBlock({ block }: { block: PermissionBlockModel }) {
  return (
    <section className="rounded-lg border border-agent-chip-border bg-agent-surface-inset p-4">
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="border-agent-chip-border bg-agent-chip-bg text-agent-text-muted">
          {block.decision ?? "permission"}
        </Badge>
        <span className="font-medium text-sm text-agent-text-bright">{block.title}</span>
      </div>
      {block.reason && <p className="mt-2 text-agent-text-muted text-sm">{block.reason}</p>}
    </section>
  );
}

