import { useRunStore } from "../store";
import type { ReplanEntry } from "../types";

const NO_REPLANS: readonly ReplanEntry[] = [];

const ACTION_LABEL = { continue: "kept going", rerun: "ran work again", stop: "stopped for a person" } as const;

function triggerText(entry: ReplanEntry): string {
  const shown = entry.triggers.map((trigger) => `${trigger.taskId} ${trigger.kind.replaceAll("-", " ")}`).join(", ");
  return entry.hiddenTriggerCount > 0 ? `${shown} (+${entry.hiddenTriggerCount} more)` : shown;
}

function rerunText(entry: ReplanEntry): string {
  return entry.rerun.map((task) => (task.engineId ? `${task.id} on ${task.engineId}` : task.id)).join(", ");
}

function ReplanRow({ entry }: { readonly entry: ReplanEntry }) {
  return (
    <li className="flex flex-col gap-0.5" title={entry.triggers.map((trigger) => `${trigger.taskId}: ${trigger.detail}`).join("\n")}>
      <span>
        <span className="text-agent-text-bright">Round {entry.round}</span> · {triggerText(entry)} → {entry.action === null ? "asking the coordinator…" : ACTION_LABEL[entry.action]}
        {entry.rerun.length > 0 && `: ${rerunText(entry)}`}
      </span>
      {entry.reason && <span className="text-agent-text-faint">{entry.reason}</span>}
      {entry.warnings.map((warning) => <span key={warning} className="text-agent-warn">{warning}</span>)}
    </li>
  );
}

export function ReplanNotes() {
  const replans = useRunStore((state) => state.run?.replans ?? NO_REPLANS);
  if (replans.length === 0) return null;
  return (
    <div className="flex w-full flex-col gap-1 text-[11px] text-agent-text-muted" role="group" aria-label="Coordinator decisions">
      <span className="font-medium text-agent-text">What the coordinator decided when the plan met reality</span>
      <ul className="flex flex-col gap-1">
        {replans.map((entry) => <ReplanRow key={entry.round} entry={entry} />)}
      </ul>
    </div>
  );
}
