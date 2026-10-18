import { cn } from "@/shared/lib";

export function StatCounts({
  additions,
  deletions,
  className,
}: {
  readonly additions: number;
  readonly deletions: number;
  readonly className?: string;
}) {
  return (
    <span className={cn("shrink-0 font-mono text-[11px] tabular-nums", className)}>
      <span className="text-agent-success">+{additions}</span>{" "}
      <span className="text-agent-critical-fg">&minus;{deletions}</span>
    </span>
  );
}
