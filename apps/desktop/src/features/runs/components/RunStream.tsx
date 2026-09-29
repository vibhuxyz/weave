import { useShallow } from "zustand/react/shallow";
import { PLANNER_TASK_ID } from "../constants";
import { selectRunStream, useRunStore } from "../store";
import { outcomeText } from "./outcome-text";
import { StreamBlockView } from "./StreamBlockView";
import { WorkerColumns } from "./WorkerColumns";

export function RunStream() {
  const { blocks, hiddenBlockCount, outcome, plannerLabel, isPlanning } = useRunStore(useShallow(selectRunStream));
  if (blocks.length === 0 && outcome === null) return null;
  const planner = blocks.filter((block) => block.taskId === PLANNER_TASK_ID);
  const worked = blocks.filter((block) => block.taskId !== PLANNER_TASK_ID);
  return (
    <div className="flex flex-col gap-5" aria-label="Parallel run activity">
      {hiddenBlockCount > 0 && <span className="text-[11px] text-agent-text-faint">({hiddenBlockCount} earlier steps hidden)</span>}
      {planner.map((block) => (
        <StreamBlockView key={block.id} block={block} plannerLabel={plannerLabel} isPlanning={isPlanning} />
      ))}
      {outcome === null ? (
        <WorkerColumns />
      ) : (
        worked.map((block) => <StreamBlockView key={block.id} block={block} plannerLabel={plannerLabel} isPlanning={false} />)
      )}
      {outcome && <p className="text-agent-text-muted text-xs">{outcomeText(outcome)}</p>}
    </div>
  );
}
