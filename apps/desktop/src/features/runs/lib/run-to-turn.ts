import type { ChatTurn, ToolEntry, TurnPersona, TurnRunLane, TurnSegment } from "@/features/chat/hooks";
import type { RunOutcome } from "../../../../server/index.ts";
import { MAX_RUN_SUMMARY_FILES, PLANNER_TASK_ID, RUN_TURN_ID_PREFIX } from "../constants";
import { outcomeText } from "../components/outcome-text";
import { laneCostUsd } from "../store/lane";
import type { RunState, StreamBlock } from "../types";

const SEGMENT_SEPARATOR = ":";

function scopedId(blockId: string, id: string): string {
  return `${blockId}${SEGMENT_SEPARATOR}${id}`;
}

function scopedSegment(block: StreamBlock, segment: TurnSegment): TurnSegment | null {
  switch (segment.kind) {
    case "text":
    case "thought":
      return { ...segment, id: scopedId(block.id, segment.id) };
    case "tools":
      return { ...segment, id: scopedId(block.id, segment.id), toolIds: segment.toolIds.map((id) => scopedId(block.id, id)) };
    case "answers":
      return null;
    default: {
      const unreachable: never = segment;
      return unreachable;
    }
  }
}

function scopedTools(block: StreamBlock): readonly ToolEntry[] {
  return block.turn.tools.map((tool) => ({ ...tool, id: scopedId(block.id, tool.id) }));
}

function headingSegment(run: RunState, block: StreamBlock): TurnSegment {
  const title = run.lanes[block.taskId]?.title ?? block.taskId;
  return { id: scopedId(block.id, "heading"), kind: "text", text: `**${block.taskId}** · ${title}` };
}

function assignedPersonas(run: RunState): TurnPersona[] | undefined {
  const seen = new Set<string>();
  const agents: TurnPersona[] = [];
  for (const taskId of run.laneOrder) {
    const employeeId = run.lanes[taskId]?.employee?.employeeId;
    if (!employeeId || seen.has(employeeId)) continue;
    seen.add(employeeId);
    agents.push({ id: employeeId, name: employeeId, kind: "employee" });
  }
  return agents.length > 0 ? agents : undefined;
}

function workerBlocks(run: RunState): readonly StreamBlock[] {
  return run.stream.filter((block) => block.taskId !== PLANNER_TASK_ID);
}

function blockSegments(run: RunState, block: StreamBlock, hasHeading: boolean): readonly TurnSegment[] {
  const own = (block.turn.segments ?? []).flatMap((segment) => scopedSegment(block, segment) ?? []);
  return hasHeading ? [headingSegment(run, block), ...own] : own;
}

function laneSummary(run: RunState): readonly TurnRunLane[] {
  return run.laneOrder.flatMap((taskId) => {
    const lane = run.lanes[taskId];
    return lane
      ? [{
          taskId,
          title: lane.title,
          status: lane.status,
          changedFiles: lane.changedFiles,
          costUsd: laneCostUsd(lane),
          employeeId: lane.employee?.employeeId ?? null,
        }]
      : [];
  });
}

function isCancelled(outcome: RunOutcome): boolean {
  return outcome.status === "ran" && outcome.result === "cancelled";
}

export function runToTurn(run: RunState, now: number): ChatTurn | null {
  if (run.outcome === null) return null;
  const blocks = workerBlocks(run);
  if (blocks.length === 0 && isCancelled(run.outcome)) return null;
  const hasHeading = blocks.length > 1;
  const lanes = laneSummary(run);
  const outcomeLine = outcomeText(run.outcome);
  const outcomeSegment: TurnSegment = { id: `${RUN_TURN_ID_PREFIX}${run.runKey}:outcome`, kind: "text", text: outcomeLine };
  const segments = [...blocks.flatMap((block) => blockSegments(run, block, hasHeading)), outcomeSegment];
  const files = [...new Set(run.files.map((file) => file.path))];
  return {
    id: `${RUN_TURN_ID_PREFIX}${run.runKey}`,
    role: "assistant",
    text: segments.flatMap((segment) => (segment.kind === "text" ? [segment.text] : [])).join("\n\n"),
    createdAt: now,
    thought: "",
    tools: blocks.flatMap(scopedTools),
    segments,
    personas: assignedPersonas(run),
    run: {
      outcomeText: outcomeLine,
      durationMs: (run.finishedAt ?? now) - run.startedAt,
      costUsd: lanes.reduce((total, lane) => total + lane.costUsd, 0),
      lanes,
      files: files.slice(0, MAX_RUN_SUMMARY_FILES),
      hiddenFileCount: Math.max(0, files.length - MAX_RUN_SUMMARY_FILES) + run.hiddenFileCount,
    },
  };
}

export function isRunSettled(run: RunState): boolean {
  if (run.outcome === null) return false;
  if (run.outcome.status !== "ran" || run.outcome.review === null) return true;
  return !run.outcome.review.canAccept || run.resultDecision !== null;
}
