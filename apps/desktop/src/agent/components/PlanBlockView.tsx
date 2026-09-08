import { useState } from "react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import {
  Plan,
  PlanHeader,
  PlanTitle,
  PlanDescription,
  PlanContent,
  PlanTrigger,
  PlanFooter,
} from "@/shared/ui/ai-elements/plan";
import { CheckCircle2, Circle, Clock, Edit3, Sparkles } from "lucide-react";
import type { PlanBlock, PlanBlockEntry } from "../normalize/types";
import { PlanApprovalModal } from "./PlanApprovalModal";
import type { TurnPlan } from "../../useAcpChat";

export function PlanBlockView({
  block,
  engineLabel,
  onSend,
  onUpdatePlan,
}: {
  block: PlanBlock;
  engineLabel?: string;
  onSend?: (text: string) => void;
  onUpdatePlan?: (plan: TurnPlan) => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [entries, setEntries] = useState<PlanBlockEntry[]>(block.entries);
  const [isApproved, setIsApproved] = useState(block.approved ?? false);

  const completedCount = entries.filter(
    (e) => e.status === "completed",
  ).length;

  const handleApprove = (
    approvedEntries: PlanBlockEntry[],
    note?: string,
  ) => {
    setEntries(approvedEntries);
    setIsApproved(true);

    const stepsText = approvedEntries
      .map((entry, idx) => `${idx + 1}. ${entry.content}`)
      .join("\n");

    const prompt = note
      ? `Approved execution plan:\n${stepsText}\n\nNote: ${note}\n\nPlease proceed with executing this plan step-by-step.`
      : `Approved execution plan:\n${stepsText}\n\nPlease proceed with executing this plan step-by-step.`;

    onUpdatePlan?.({ entries: approvedEntries, approved: true });
    onSend?.(prompt);
  };

  const handleReject = (feedback?: string) => {
    const prompt = feedback
      ? `Plan rejected. Feedback: ${feedback}. Please revise your proposed plan or ask for clarification.`
      : `Plan rejected. Please revise the plan or stop.`;

    onSend?.(prompt);
  };

  return (
    <>
      <Plan defaultOpen className="my-2 border border-border/70 bg-card/60">
        <PlanHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-agent-accent" />
            <PlanTitle className="text-sm font-semibold">
              {block.title ?? "Execution Plan"}
            </PlanTitle>
            {isApproved ? (
              <Badge variant="outline" className="border-agent-success text-agent-success text-[10px] uppercase font-mono">
                Approved
              </Badge>
            ) : (
              <Badge variant="outline" className="border-agent-warn text-agent-warn text-[10px] uppercase font-mono">
                Awaiting Approval
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => setModalOpen(true)}
              className="gap-1 text-xs"
            >
              <Edit3 className="size-3" />
              {isApproved ? "Edit Plan" : "Review & Approve"}
            </Button>
            <PlanTrigger />
          </div>
        </PlanHeader>

        <PlanDescription className="px-4 pb-2 text-xs text-muted-foreground">
          {`${completedCount} of ${entries.length} steps completed`}
        </PlanDescription>

        <PlanContent className="px-4 pb-3">
          <div className="space-y-1.5">
            {entries.map((entry, idx) => (
              <div
                key={entry.id || idx}
                className="flex items-start gap-2 text-xs py-1"
              >
                {entry.status === "completed" ? (
                  <CheckCircle2 className="size-3.5 text-agent-success shrink-0 mt-0.5" />
                ) : entry.status === "in_progress" ? (
                  <Clock className="size-3.5 text-agent-accent animate-spin shrink-0 mt-0.5" />
                ) : (
                  <Circle className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
                )}
                <span
                  className={`leading-relaxed ${
                    entry.status === "completed"
                      ? "line-through text-muted-foreground"
                      : "text-foreground"
                  }`}
                >
                  <span className="font-mono text-muted-foreground mr-1.5">
                    {idx + 1}.
                  </span>
                  {entry.content}
                </span>
              </div>
            ))}
          </div>
        </PlanContent>

        {!isApproved && (
          <PlanFooter className="flex justify-end gap-2 border-t px-4 py-2 bg-muted/20">
            <Button
              type="button"
              variant="primary"
              size="xs"
              onClick={() => setModalOpen(true)}
              className="gap-1"
            >
              <Edit3 className="size-3" />
              Review & Approve Plan
            </Button>
          </PlanFooter>
        )}
      </Plan>

      <PlanApprovalModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        entries={entries}
        engineLabel={engineLabel}
        onApprove={handleApprove}
        onReject={handleReject}
      />
    </>
  );
}
