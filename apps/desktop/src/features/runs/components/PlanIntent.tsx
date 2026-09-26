import { useShallow } from "zustand/react/shallow";
import { MAX_LISTED_PLAN_NOTES } from "../constants";
import { useRunStore } from "../store";

const EMPTY: readonly string[] = [];

function NoteList({ label, notes }: { readonly label: string; readonly notes: readonly string[] }) {
  const shown = notes.slice(0, MAX_LISTED_PLAN_NOTES);
  const hidden = notes.length - shown.length;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-medium text-agent-text-muted">{label}</span>
      <ul className="flex flex-col gap-0.5">
        {shown.map((note) => (
          <li key={note} className="text-[11px] text-agent-text-faint">{note}</li>
        ))}
        {hidden > 0 && <li className="text-[11px] text-agent-text-faint">(+{hidden} more)</li>}
      </ul>
    </div>
  );
}

export function PlanIntent() {
  const { goal, assumptions, risks } = useRunStore(
    useShallow((state) => ({
      goal: state.run?.plan?.goal ?? null,
      assumptions: state.run?.plan?.assumptions ?? EMPTY,
      risks: state.run?.plan?.risks ?? EMPTY,
    })),
  );
  if (goal === null && assumptions.length === 0 && risks.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {goal && <p className="text-agent-text text-xs">{goal}</p>}
      {assumptions.length > 0 && <NoteList label="Assuming" notes={assumptions} />}
      {risks.length > 0 && <NoteList label="Risks" notes={risks} />}
    </div>
  );
}
