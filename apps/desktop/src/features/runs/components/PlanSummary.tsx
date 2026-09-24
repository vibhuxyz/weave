import { useShallow } from "zustand/react/shallow";
import { useRunStore } from "../store";

const MODE_LABEL = { sequential: "One worker, in order", parallel: "Parallel workers" } as const;

export function PlanSummary() {
  const { plan, contractVersion, integration } = useRunStore(
    useShallow((state) => ({ plan: state.run?.plan ?? null, contractVersion: state.run?.contractVersion ?? null, integration: state.run?.integration ?? null })),
  );
  if (!plan) return <p className="text-agent-text-muted text-xs">Planning…</p>;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-agent-text-muted">
      <span>{MODE_LABEL[plan.mode]} ({plan.reason})</span>
      {contractVersion !== null && <span>contract v{contractVersion}</span>}
      {integration && (
        <span>
          integration {integration.status} on {integration.branch}
          {integration.brokenBy && `, broken by ${integration.brokenBy}`}
        </span>
      )}
    </div>
  );
}
