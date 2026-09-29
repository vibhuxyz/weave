import { useShallow } from "zustand/react/shallow";
import type { RunClassification, RunCritique } from "../../../../server/index.ts";
import { formatNumber } from "@/shared/i18n";
import { usdFromMicro, workerCapacityText, workerCountText, workforceText } from "../lib";
import { selectWorkforce, useRunStore } from "../store";
import type { PlanningEnginesSummary } from "../types";

const MODE_LABEL = { sequential: "One worker, in order", parallel: "Parallel workers" } as const;
const RISK_CLASS = { low: "", medium: "text-agent-medium-fg", high: "text-agent-high-fg" } as const;
const MS_PER_SECOND = 1_000;
const SECONDS = { style: "unit", unit: "second", unitDisplay: "short", maximumFractionDigits: 0 } as const;
const USD = { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 } as const;

function classificationText(classification: RunClassification): string {
  const domains = classification.domains.length > 0 ? ` · ${classification.domains.join(", ")}` : "";
  return `${classification.taskType} · ${classification.scope.replaceAll("-", " ")} · ${classification.risk} risk${domains}`;
}

function critiqueText(critique: RunCritique): string {
  if (critique.outcome === "approved") return "AI review: approved";
  if (critique.outcome === "revised") return `AI review: revised for ${critique.issues.length} ${critique.issues.length === 1 ? "issue" : "issues"}`;
  return critique.issues.length > 0 ? "AI review: changes asked, plan kept" : "AI review: did not complete";
}

function planningText(planning: PlanningEnginesSummary | null): string {
  if (!planning?.planner) return "Planning…";
  const review = planning.reviewer && planning.reviewer !== planning.planner ? ` · review by ${planning.reviewer}` : "";
  return `Planning with ${planning.planner}${review}…`;
}

export function PlanSummary() {
  const { plan, planning, classification, critique, contractVersion, integration, orchestration, workerCount } = useRunStore(
    useShallow((state) => ({ plan: state.run?.plan ?? null, planning: state.run?.planning ?? null, classification: state.run?.review?.classification ?? null, critique: state.run?.review?.critique ?? null, contractVersion: state.run?.contractVersion ?? null, integration: state.run?.integration ?? null, orchestration: state.run?.orchestration ?? null, workerCount: state.run?.workerCount ?? null })),
  );
  const live = workforceText(useRunStore(useShallow(selectWorkforce)));
  const estimatedUsd = orchestration ? usdFromMicro(orchestration.estimatedCostMicroUsd) : null;
  const estimatedCost = estimatedUsd === null ? null : formatNumber(estimatedUsd, USD);
  if (!plan) return <p className="text-agent-text-muted text-xs">{planningText(planning)}</p>;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-agent-text-muted">
      {classification && <span className={RISK_CLASS[classification.risk]}>{classificationText(classification)}</span>}
      {critique && <span>{critiqueText(critique)}</span>}
      <span>{MODE_LABEL[plan.mode]} ({plan.reason})</span>
      {workerCount && <span title={workerCapacityText(workerCount)}>{live ?? workerCountText(workerCount)}</span>}
      {orchestration && (
        <span title={orchestration.reason}>
          {orchestration.reason}
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
