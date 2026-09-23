import { Skeleton } from "@/shared/ui";
import { cn } from "@/shared/lib";
import { SKELETON_STAGGER_MS } from "./constants";

interface ColumnSkeletonProps {
  rowWidths: readonly string[];
  label: string;
}

export function ColumnSkeleton({ rowWidths, label }: ColumnSkeletonProps) {
  return (
    <div className="flex flex-col gap-0.5" role="status" aria-label={label}>
      {rowWidths.map((width, index) => (
        <div key={`${width}-${index}`} className="flex h-8 items-center px-2">
          <Skeleton
            className={cn("h-3 rounded-full bg-white/10 motion-reduce:animate-none", width)}
            style={{ animationDelay: `${index * SKELETON_STAGGER_MS}ms` }}
          />
        </div>
      ))}
    </div>
  );
}
