import { Badge } from "@/shared/ui/badge";
import type { PermissionBlock as PermissionBlockModel } from "../normalize/types";

export function PermissionBlock({ block }: { block: PermissionBlockModel }) {
  return (
    <section className="rounded-lg border border-[#3a2d34] bg-[#181820] p-4">
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="border-[#383341] bg-[#24232d] text-[#a8a2b3]">
          {block.decision ?? "permission"}
        </Badge>
        <span className="font-medium text-sm text-white">{block.title}</span>
      </div>
      {block.reason && <p className="mt-2 text-[#a8a2b3] text-sm">{block.reason}</p>}
    </section>
  );
}

