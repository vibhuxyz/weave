import { useState } from "react";
import { ListTodoIcon } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { PromptCard, PromptCardHeader, PromptCardBody } from "@/features/chat/components";
import type { PermissionRequest } from "@/features/chat/hooks";
import { PermissionContent } from "@/features/chat/components/PermissionCard";
import { MAX_VISIBLE_LANES } from "../constants";
import { selectRunHeader, useRunStore } from "../store";
import { ArtifactFlow } from "./ArtifactFlow";
import { BudgetAlerts } from "./BudgetAlerts";
import { LaneCard } from "./LaneCard";
import { LiveCost } from "./LiveCost";
import { outcomeText } from "./outcome-text";
import { PlanApproval } from "./PlanApproval";
import { PlanIntent } from "./PlanIntent";
import { PlanSummary } from "./PlanSummary";

interface RunPanelProps {
  readonly onSetUpGitAndRun: (request: string) => void;
  readonly onDecidePlan: (runKey: string, approved: boolean) => void;
  readonly permissionRequest?: PermissionRequest | null;
  readonly onAnswerPermission?: (requestId: string, optionId: string | null) => void;
}

export function RunPanel({ onSetUpGitAndRun, onDecidePlan, permissionRequest, onAnswerPermission }: RunPanelProps) {
  const { runKey, approval, request, outcome, laneOrder } = useRunStore(useShallow(selectRunHeader));
  const plan = useRunStore((state) => state.run?.plan ?? null);
  const dismiss = useRunStore((state) => state.dismiss);
  const [isCollapsed, setIsCollapsed] = useState(false);
  if (request === null || approval === "approved") return null;
  if (plan === null && outcome === null) return null;
  const visible = laneOrder.slice(0, MAX_VISIBLE_LANES);
  const hiddenCount = laneOrder.length - visible.length;

  const isWaitingApproval = runKey !== null && approval === "waiting" && outcome === null;

  return (
    <PromptCard as="section" aria-label="Parallel run plan">
      <PromptCardHeader
        badge={isWaitingApproval ? "Plan ready" : outcome ? "Run finished" : "Plan"}
        badgeVariant={isWaitingApproval ? "warn" : outcome ? "muted" : "accent"}
        icon={<ListTodoIcon className="mt-0.5 size-4 shrink-0 text-agent-accent" />}
        title={request}
        subtitle={<PlanSummary />}
        isCollapsed={isCollapsed}
        onToggleCollapsed={() => setIsCollapsed(!isCollapsed)}
        extra={<LiveCost />}
        onClose={outcome !== null ? dismiss : undefined}
        closeLabel="Close run panel"
      />
      {!isCollapsed && (
        <PromptCardBody>
          {isWaitingApproval && (
            <PlanApproval onStart={() => onDecidePlan(runKey, true)} onDecline={() => onDecidePlan(runKey, false)} />
          )}
          <PlanIntent />
          <BudgetAlerts />
          {permissionRequest && onAnswerPermission && (
            <div className="flex flex-col gap-2 rounded-lg border border-agent-warn/40 bg-agent-warn-bg/20 p-3">
              <span className="text-xs font-semibold text-agent-warn">{permissionRequest.title}</span>
              <PermissionContent request={permissionRequest} onAnswer={onAnswerPermission} />
            </div>
          )}
          {visible.length > 0 && (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {visible.map((taskId) => <LaneCard key={taskId} taskId={taskId} />)}
            </ul>
          )}
          {hiddenCount > 0 && <span className="text-[11px] text-agent-text-faint">(+{hiddenCount} more lanes)</span>}
          <ArtifactFlow />
          {outcome && <p className="text-agent-text-muted text-xs">{outcomeText(outcome)}</p>}
          {outcome?.status === "needs-git" && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onSetUpGitAndRun(request)}
                className="rounded-full bg-agent-surface-hover px-3 py-1 text-agent-text-bright text-xs hover:bg-agent-border"
              >
                Set up git and run
              </button>
              <span className="text-[11px] text-agent-text-faint">
                Creates the repository if needed, adds a .gitignore if there is none, and commits the current files.
              </span>
            </div>
          )}
        </PromptCardBody>
      )}
    </PromptCard>
  );
}
