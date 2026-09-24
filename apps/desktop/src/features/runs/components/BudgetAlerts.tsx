import { useShallow } from "zustand/react/shallow";
import type { BudgetAlert } from "../../../../server/index.ts";
import { useRunStore } from "../store";

const NO_ALERTS: readonly BudgetAlert[] = [];

const ACTION_TEXT = { "stop-task": "task stopped", "stop-run": "run stopped", "skip-task": "task skipped" } as const;

export function BudgetAlerts() {
  const { alerts, hiddenCount } = useRunStore(
    useShallow((state) => ({ alerts: state.run?.budgetAlerts ?? NO_ALERTS, hiddenCount: state.run?.hiddenAlertCount ?? 0 })),
  );
  if (alerts.length === 0) return null;
  return (
    <ul role="alert" className="flex flex-col gap-0.5 text-[11px] text-agent-warn" aria-label="Budget alerts">
      {alerts.map((alert, index) => (
        <li key={`${index}:${alert.scope}:${alert.key}:${alert.dimension}`}>
          Over the {alert.scope} {alert.dimension} budget for {alert.key}: spent {alert.spent} of {alert.limit}, {ACTION_TEXT[alert.action]}
        </li>
      ))}
      {hiddenCount > 0 && <li>(+{hiddenCount} more)</li>}
    </ul>
  );
}
