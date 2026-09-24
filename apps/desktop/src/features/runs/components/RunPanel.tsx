import { XIcon } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { MAX_VISIBLE_LANES } from "../constants";
import { selectRunHeader, useRunStore } from "../store";
import { BudgetAlerts } from "./BudgetAlerts";
import { LaneCard } from "./LaneCard";
import { LiveCost } from "./LiveCost";
import { outcomeText } from "./outcome-text";
import { PlanSummary } from "./PlanSummary";

export function RunPanel({ onCancel }: { readonly onCancel: () => void }) {
  const { request, outcome, laneOrder } = useRunStore(useShallow(selectRunHeader));
  const dismiss = useRunStore((state) => state.dismiss);
  if (request === null) return null;
  const visible = laneOrder.slice(0, MAX_VISIBLE_LANES);
  const hiddenCount = laneOrder.length - visible.length;
  return (
    <section className="dark flex w-full flex-col gap-3 rounded-xl border border-agent-border bg-agent-surface-raised px-4 py-3" aria-label="Parallel run">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate font-medium text-agent-text-bright text-sm">{request}</span>
          <PlanSummary />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <LiveCost />
          {outcome === null ? (
            <button type="button" onClick={onCancel} className="rounded-full border border-agent-border px-3 py-1 text-agent-text text-xs hover:bg-agent-surface-hover">
              Cancel run
            </button>
          ) : (
            <button type="button" onClick={dismiss} aria-label="Close run panel" className="rounded-full p-1 text-agent-text-muted hover:bg-agent-surface-hover">
              <XIcon className="size-4" />
            </button>
          )}
        </div>
      </header>
      <BudgetAlerts />
      {visible.length > 0 && (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {visible.map((taskId) => <LaneCard key={taskId} taskId={taskId} />)}
        </ul>
      )}
      {hiddenCount > 0 && <span className="text-[11px] text-agent-text-faint">(+{hiddenCount} more lanes)</span>}
      {outcome && <p className="text-agent-text-muted text-xs">{outcomeText(outcome)}</p>}
    </section>
  );
}
