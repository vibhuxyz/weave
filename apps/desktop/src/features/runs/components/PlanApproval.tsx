import { memo } from "react";
import { useShallow } from "zustand/react/shallow";
import { formatNumber } from "@/shared/i18n";
import { PromptCardButton } from "@/features/chat/components";
import type { RunExecutionSlot } from "../../../../server/index.ts";
import { durationMinutes, engineText, slotStartText, usdFromMicro } from "../lib";
import { useRunStore } from "../store";

const MINUTES = { style: "unit", unit: "minute", unitDisplay: "short", maximumFractionDigits: 0 } as const;
const USD = { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 } as const;

interface PlanApprovalProps {
  readonly onStart: () => void;
  readonly onDecline: () => void;
}

function PlanWarnings() {
  const { warnings, hiddenWarningCount } = useRunStore(
    useShallow((state) => ({ warnings: state.run?.review?.warnings ?? [], hiddenWarningCount: state.run?.review?.hiddenWarningCount ?? 0 })),
  );
  if (warnings.length === 0) return null;
  return (
    <div className="flex w-full flex-col gap-1 text-[11px] text-agent-medium-fg">
      <span className="font-medium">Weave checked this plan and found:</span>
      <ul className="flex list-disc flex-col gap-0.5 pl-4">
        {warnings.map((warning, index) => <li key={`${index}:${warning}`}>{warning}</li>)}
      </ul>
      {hiddenWarningCount > 0 && <span className="text-agent-text-faint">(+{hiddenWarningCount} more)</span>}
    </div>
  );
}

function SlotRowView({ slot, isEstimated }: { readonly slot: RunExecutionSlot; readonly isEstimated: boolean }) {
  const title = useRunStore((state) => state.run?.lanes[slot.taskId]?.title ?? slot.taskId);
  return (
    <li className="flex flex-wrap gap-x-2">
      <span className="text-agent-text-faint">Worker {slot.worker}</span>
      <span className="text-agent-text-bright">{slot.taskId} · {title}</span>
      <span>{slot.employeeId ?? "no employee"}</span>
      <span>{engineText(slot)}</span>
      <span>{slotStartText(slot)}</span>
      {isEstimated && <span>~{formatNumber(durationMinutes(slot.endMs - slot.startMs), MINUTES)}</span>}
    </li>
  );
}

const SlotRow = memo(SlotRowView);

function ExecutionSchedule() {
  const execution = useRunStore((state) => state.run?.execution ?? null);
  if (!execution) return null;
  const isEstimated = execution.timing === "estimated";
  const costUsd = execution.estimatedCostMicroUsd === null ? null : usdFromMicro(execution.estimatedCostMicroUsd);
  return (
    <div className="flex w-full flex-col gap-1 text-[11px] text-agent-text-muted">
      <span className="font-medium text-agent-text">
        {execution.workers} {execution.workers === 1 ? "worker" : "workers"}
        {isEstimated && execution.estimatedMs !== null && `, about ${formatNumber(durationMinutes(execution.estimatedMs), MINUTES)}`}
        {costUsd !== null && `, about ${formatNumber(costUsd, USD)}`}
      </span>
      <ol className="flex flex-col gap-0.5">
        {execution.slots.map((slot) => <SlotRow key={slot.taskId} slot={slot} isEstimated={isEstimated} />)}
      </ol>
    </div>
  );
}

const CRITIQUE_HEADING = { revised: "The reviewer raised these, and the plan was revised:", kept: "The reviewer raised these, but the revision was invalid:" } as const;

function PlanCritique() {
  const critique = useRunStore((state) => state.run?.review?.critique ?? null);
  if (!critique || critique.outcome === "approved" || critique.issues.length === 0) return null;
  return (
    <div className="flex w-full flex-col gap-1 text-[11px] text-agent-text-muted">
      <span className="font-medium">{CRITIQUE_HEADING[critique.outcome]}</span>
      <ul className="flex list-disc flex-col gap-0.5 pl-4">
        {critique.issues.map((issue, index) => (
          <li key={`${index}:${issue.type}`}>
            {issue.type.replaceAll("_", " ")}
            {issue.taskIds.length > 0 && ` (${issue.taskIds.join(", ")})`}: {issue.reason}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PlanApproval({ onStart, onDecline }: PlanApprovalProps) {
  return (
    <div role="region" aria-label="Review the plan" className="flex flex-col gap-3 rounded-xl border border-agent-border/60 bg-agent-surface-inset p-3.5">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-agent-text text-xs leading-relaxed">
          Review the plan below: the tasks, their order, who works on each, which skills they get and which files each may change. Nothing has run yet.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <PromptCardButton variant="secondary" onClick={onDecline}>
            Don't run
          </PromptCardButton>
          <PromptCardButton variant="primary" onClick={onStart}>
            Start run
          </PromptCardButton>
        </div>
      </div>
      <ExecutionSchedule />
      <PlanCritique />
      <PlanWarnings />
    </div>
  );
}
