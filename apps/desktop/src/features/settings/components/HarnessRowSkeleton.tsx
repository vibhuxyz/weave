import { Skeleton } from "@/shared/ui";
import { cn } from "@/shared/lib";

const SKELETON_STAGGER_MS = 80;

interface HarnessRowSkeletonProps {
  readonly labelWidth: string;
  readonly subtitleWidth: string;
  readonly delayMs: number;
}

function Bar({ className, delayMs }: { className: string; delayMs: number }) {
  return (
    <Skeleton
      className={cn("rounded-full bg-white/10 motion-reduce:animate-none", className)}
      style={{ animationDelay: `${delayMs}ms` }}
    />
  );
}

export function HarnessRowSkeleton({
  labelWidth,
  subtitleWidth,
  delayMs,
}: HarnessRowSkeletonProps) {
  return (
    <div className="flex flex-col py-4 first:pt-2 last:pb-2" aria-hidden>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-start gap-3.5 min-w-0">
          <Bar className="size-5 shrink-0 rounded-md" delayMs={delayMs} />
          <div className="flex flex-col gap-2 min-w-0 pt-0.5">
            <Bar className={cn("h-3.5", labelWidth)} delayMs={delayMs + SKELETON_STAGGER_MS} />
            <Bar className={cn("h-3", subtitleWidth)} delayMs={delayMs + SKELETON_STAGGER_MS * 2} />
          </div>
        </div>
        <Bar className="h-6 w-24 shrink-0" delayMs={delayMs + SKELETON_STAGGER_MS * 3} />
      </div>
    </div>
  );
}
