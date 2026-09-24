import { Skeleton } from "@/shared/ui";
import { SKELETON_ROW_COUNT } from "../constants";

const ROW_KEYS = Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => `skeleton-row-${index}`);
const PULSE = "motion-reduce:animate-none";

export function ArchiveRowsSkeleton() {
  return (
    <div role="status" aria-label="Loading archived items" className="divide-y divide-border">
      {ROW_KEYS.map((key) => (
        <div key={key} className="flex items-center gap-4 py-3.5 pr-4">
          <Skeleton className={`size-4 rounded ${PULSE}`} />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className={`h-3.5 w-40 ${PULSE}`} />
            <Skeleton className={`h-3 w-64 max-w-full ${PULSE}`} />
          </div>
          <Skeleton className={`h-8 w-16 rounded-lg ${PULSE}`} />
          <Skeleton className={`h-8 w-14 rounded-lg ${PULSE}`} />
        </div>
      ))}
    </div>
  );
}

export function SelectSkeleton() {
  return <Skeleton role="status" aria-label="Loading setting" className={`h-9 w-44 rounded-lg ${PULSE}`} />;
}
