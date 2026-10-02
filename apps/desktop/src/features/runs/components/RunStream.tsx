import { useShallow } from "zustand/react/shallow";
import { PLANNER_TASK_ID } from "../constants";
import { selectRunStream, useRunStore } from "../store";
import { outcomeText } from "./outcome-text";
import type { ResultDecision } from "../../../../server/index.ts";
import { RepoSetupNote } from "./RepoSetupNote";
import { ResultReview } from "./result-review";
import { RouteNote } from "./RouteNote";
import { StreamBlockView } from "./StreamBlockView";
import { WorkerColumns } from "./WorkerColumns";

interface RunStreamProps {
  readonly onKeepInChat: (request: string) => void;
  readonly onDecideResult: (runKey: string, decision: ResultDecision) => void;
  readonly projectDir: string | null;
  readonly onOpenDiff?: (turnId: string, path?: string) => void;
}

export function RunStream({ onKeepInChat, onDecideResult, projectDir, onOpenDiff }: RunStreamProps) {
  const { blocks, hiddenBlockCount, outcome, plannerLabel, isPlanning } = useRunStore(useShallow(selectRunStream));
  const notes = (
    <>
      <RouteNote onKeepInChat={onKeepInChat} />
      <RepoSetupNote />
    </>
  );
  if (blocks.length === 0 && outcome === null) return notes;
  const planner = blocks.filter((block) => block.taskId === PLANNER_TASK_ID);
  const worked = blocks.filter((block) => block.taskId !== PLANNER_TASK_ID);
  return (
    <div className="flex flex-col gap-5" aria-label="Parallel run activity">
      {notes}
      {hiddenBlockCount > 0 && <span className="text-[11px] text-agent-text-faint">({hiddenBlockCount} earlier steps hidden)</span>}
      {planner.map((block) => (
        <StreamBlockView key={block.id} block={block} plannerLabel={plannerLabel} isPlanning={isPlanning} projectDir={projectDir} onOpenDiff={onOpenDiff} />
      ))}
      {worked.map((block) => (
        <StreamBlockView key={block.id} block={block} plannerLabel={null} isPlanning={false} projectDir={projectDir} onOpenDiff={onOpenDiff} />
      ))}
      <WorkerColumns />
      {outcome && <p className="text-agent-text-muted text-xs">{outcomeText(outcome)}</p>}
      <ResultReview onDecideResult={onDecideResult} />
    </div>
  );
}
