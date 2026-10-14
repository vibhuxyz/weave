import { useMemo } from "react";
import { cn } from "@/shared/lib";
import { NO_LANE_ORDER, NO_LANES, NO_STREAM, useRunStore, workerPanes } from "../../store";
import { splitPanes } from "./layout";
import { SplitTreeView } from "./SplitTreeView";

interface WorkerSplitProps {
  readonly projectDir: string | null;
  readonly onOpenDiff?: (turnId: string, path?: string) => void;
  readonly onResume?: (taskId: string) => void;
}

export function WorkerSplit({ projectDir, onOpenDiff, onResume }: WorkerSplitProps) {
  const lanes = useRunStore((state) => state.run?.lanes ?? NO_LANES);
  const laneOrder = useRunStore((state) => state.run?.laneOrder ?? NO_LANE_ORDER);
  const stream = useRunStore((state) => state.run?.stream ?? NO_STREAM);
  const tree = useMemo(() => {
    const grouped = workerPanes(lanes, laneOrder, stream);
    return splitPanes([...grouped.live, ...grouped.waiting, ...grouped.done]);
  }, [lanes, laneOrder, stream]);
  if (tree === null) return null;
  const stacked = tree.kind === "split" && tree.axis === "stack";
  return (
    <div className={cn("overflow-hidden rounded-md border border-agent-border", stacked ? "h-[36rem]" : "h-80")} aria-label="Worker panes">
      <SplitTreeView tree={tree} projectDir={projectDir} onOpenDiff={onOpenDiff} onResume={onResume} />
    </div>
  );
}
