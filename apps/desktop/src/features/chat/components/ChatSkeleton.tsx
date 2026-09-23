import { Skeleton } from "@/shared/ui";
import { cn } from "@/shared/lib";

const SKELETON_STAGGER_MS = 80;

const PROMPT_WIDTHS = ["w-48", "w-64"] as const;
const REPLY_LINE_WIDTHS = [
  ["w-full", "w-[92%]", "w-[68%]"],
  ["w-[88%]", "w-full", "w-[74%]", "w-[45%]"],
] as const;

function Bar({ className, delayMs }: { className: string; delayMs: number }) {
  return (
    <Skeleton
      className={cn("h-3 rounded-full bg-white/10 motion-reduce:animate-none", className)}
      style={{ animationDelay: `${delayMs}ms` }}
    />
  );
}

export function ChatSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Loading chat">
      {PROMPT_WIDTHS.map((promptWidth, exchange) => (
        <div key={promptWidth} className="flex flex-col gap-6">
          <div className="flex w-full justify-end">
            <div className="rounded-2xl bg-white/[0.04] px-4 py-3">
              <Bar className={promptWidth} delayMs={exchange * SKELETON_STAGGER_MS} />
            </div>
          </div>
          <div className="flex w-full flex-col gap-2.5">
            {REPLY_LINE_WIDTHS[exchange]?.map((lineWidth, line) => (
              <Bar
                key={`${lineWidth}-${line}`}
                className={lineWidth}
                delayMs={(exchange * REPLY_LINE_WIDTHS.length + line + 1) * SKELETON_STAGGER_MS}
              />
            ))}
          </div>
        </div>
      ))}
      <span className="sr-only">Loading chat</span>
    </div>
  );
}
