import { memo, useState, useMemo } from "react";
import { DisclosureHeader, TurnSegments } from "@/agent/components/stream";
import { FilesChanged } from "@/agent/components/stream/FilesChanged";
import { turnDiff } from "@/agent/diff";
import { useEmployeeListing } from "@/features/employees";
import { Shimmer } from "@/shared/ui/ai-elements";
import { cn } from "@/shared/lib";
import { PLANNER_TASK_ID } from "../constants";
import { useRunStore } from "../store";
import type { StreamBlock } from "../types";
import { BLOCK_STATUS_CLASS, BLOCK_STATUS_LABEL } from "./status-style";

function useEmployeeName(taskId: string): string | null {
  const employeeId = useRunStore((state) => state.run?.lanes[taskId]?.employee?.employeeId ?? null);
  const listing = useEmployeeListing();
  if (employeeId === null) return null;
  if (listing.status !== "ready") return employeeId;
  return listing.entries.find((entry) => entry.employee.id === employeeId)?.employee.name ?? employeeId;
}

function TaskHeader({ block }: { readonly block: StreamBlock }) {
  const title = useRunStore((state) => state.run?.lanes[block.taskId]?.title ?? block.taskId);
  const employeeName = useEmployeeName(block.taskId);
  return (
    <>
      <span className="font-medium text-agent-text-bright">{block.taskId}</span>
      <span className="truncate text-agent-text-muted">{employeeName ?? title}</span>
      {block.attempt > 1 && <span className="text-agent-text-faint">attempt {block.attempt}</span>}
      <span className={cn("ml-auto shrink-0", BLOCK_STATUS_CLASS[block.status])}>{BLOCK_STATUS_LABEL[block.status]}</span>
    </>
  );
}

function PlannerHeader({ label, isPlanning }: { readonly label: string | null; readonly isPlanning: boolean }) {
  const text = label === null ? "Planning" : `Planning with ${label}`;
  return (
    <span className="font-medium text-agent-text-bright">{isPlanning ? <Shimmer>{`${text}…`}</Shimmer> : text}</span>
  );
}

function BlockView({
  block,
  plannerLabel,
  isPlanning,
  projectDir,
  onOpenDiff,
  showHeader = true,
}: {
  readonly block: StreamBlock;
  readonly plannerLabel: string | null;
  readonly isPlanning: boolean;
  readonly projectDir: string | null;
  readonly onOpenDiff?: (turnId: string, path?: string) => void;
  readonly showHeader?: boolean;
}) {
  const isPlanner = block.taskId === PLANNER_TASK_ID;
  const diff = useMemo(() => turnDiff(block.turn), [block.turn]);

  return (
    <section className="flex flex-col gap-2" aria-label={isPlanner ? "Planning" : `Task ${block.taskId}`}>
      {showHeader && (
        <header className="flex items-center gap-2 text-xs">
          {isPlanner ? <PlannerHeader label={plannerLabel} isPlanning={isPlanning} /> : <TaskHeader block={block} />}
        </header>
      )}
      <TurnSegments turn={block.turn} onOpenDiff={(path) => onOpenDiff?.(block.turn.id, path)} />
      {block.hiddenToolCount > 0 && <span className="text-[11px] text-agent-text-faint">(+{block.hiddenToolCount} more steps)</span>}
      {diff.files.length > 0 && (
        <FilesChanged diff={diff} projectDir={projectDir} onOpenDiff={(path) => onOpenDiff?.(block.turn.id, path)} />
      )}
    </section>
  );
}

export const StreamBlockView = memo(BlockView);
