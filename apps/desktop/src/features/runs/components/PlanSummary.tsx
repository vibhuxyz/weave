import { useShallow } from "zustand/react/shallow";
import { formatNumber } from "@/shared/i18n";
import { usdFromMicro } from "../lib";
import { useRunStore } from "../store";

const MODE_LABEL = { sequential: "One worker, in order", parallel: "Parallel workers" } as const;
const MS_PER_SECOND = 1_000;
const SECONDS = { style: "unit", unit: "second", unitDisplay: "short", maximumFractionDigits: 0 } as const;
const USD = { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 } as const;

export function PlanSummary() {
  const { plan, contractVersion, integration, orchestration } = useRunStore(
    useShallow((state) => ({ plan: state.run?.plan ?? null, contractVersion: state.run?.contractVersion ?? null, integration: state.run?.integration ?? null, orchestration: state.run?.orchestration ?? null })),
  );
  const estimatedUsd = orchestration ? usdFromMicro(orchestration.estimatedCostMicroUsd) : null;
  const estimatedCost = estimatedUsd === null ? null : formatNumber(estimatedUsd, USD);
  if (!plan) return <p className="text-agent-text-muted text-xs">Planning…</p>;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-agent-text-muted">
      <span>{MODE_LABEL[plan.mode]} ({plan.reason})</span>
      {orchestration && (
        <span title={orchestration.reason}>
          {orchestration.workers} {orchestration.workers === 1 ? "worker" : "workers"}: {orchestration.reason}
          {estimatedCost && `, about ${estimatedCost}`}
          {orchestration.timeSavedMs > 0 && `, saves about ${formatNumber(orchestration.timeSavedMs / MS_PER_SECOND, SECONDS)}`}
        </span>
      )}
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
