import { useEffect, useRef, useState } from "react";
import { Badge, Button } from "@/shared/ui";
import {
  Plan,
  PlanHeader,
  PlanTitle,
  PlanDescription,
  PlanContent,
  PlanTrigger,
  PlanFooter,
} from "@/shared/ui/ai-elements";
import { CheckCircle2, Circle, Clock, Edit3, Sparkles, XCircle } from "lucide-react";
import type { PlanBlock, PlanBlockEntry } from "@/agent/normalize";
import { PlanApprovalModal } from "./PlanApprovalModal";
import { Prose } from "./Prose";
import type { TurnPlan } from '@/features/chat/hooks';
import type { PlanExitIntent } from "@/shared/lib";

// The transcript re-derives blocks on every render, so a plan's decision has
// to live outside component state or a rejected plan pops its modal again on
// the next scroll. Keyed by `plan-<turnId>` — only good for the current app
// session, since a replayed chat gives every turn a fresh id (see
// `isLatestTurn` below for what survives an actual reopen).
const planDecisions = new Map<string, "approved" | "rejected">();
// After approving a plan the engine often re-plans one more time before it
// actually starts. Suppress the auto-open briefly so that echo doesn't pop a
// second modal for a plan the user just approved.
let lastDecisionAt = 0;

export function PlanBlockView({
  block,
  engineLabel,
  onSend,
  onUpdatePlan,
  onExitPlanMode,
  onStop,
  isLatestTurn = true,
}: {
  block: PlanBlock;
  engineLabel?: string;
  onSend?: (text: string) => void;
  onUpdatePlan?: (plan: TurnPlan) => void;
  onExitPlanMode?: (intent?: PlanExitIntent) => void;
  onStop?: () => void;
  /**
   * False once the conversation has moved past this turn.
   *
   * `block.id` is `plan-<turnId>`, and a replayed chat reassigns a fresh
   * random `turnId` to every turn on each reopen (see `withAssistantTurn` in
   * `useAcpChat.ts`) — so `planDecisions` can never recognize a plan it saw
   * approved in a previous open. Whether this turn is still the newest one
   * in the transcript doesn't have that problem: it's recomputed straight
   * from the same replayed history on every open, so a plan the user has
   * already acted on (approved, or just moved on from) never re-prompts.
   */
  isLatestTurn?: boolean;
}) {
  const isMarkdown = typeof block.markdown === "string";
  const [modalOpen, setModalOpen] = useState(false);
  const [entries, setEntries] = useState<PlanBlockEntry[]>(block.entries);
  const [markdown, setMarkdown] = useState(block.markdown ?? "");
  const [decision, setDecisionState] = useState<"pending" | "approved" | "rejected">(
    planDecisions.get(block.id) ?? (block.approved ? "approved" : "pending"),
  );
  const setDecision = (next: "approved" | "rejected") => {
    planDecisions.set(block.id, next);
    setDecisionState(next);
  };
  // Nothing left to decide on an old turn — the transcript already moved on.
  const stale = !isLatestTurn && decision === "pending";

  // Blocked-on-user plan → open the modal once. A dismiss/decision sticks;
  // re-renders never reopen it, and a rejected plan is never shown again.
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (
      block.awaitingApproval &&
      decision === "pending" &&
      isLatestTurn &&
      !autoOpenedRef.current &&
      Date.now() - lastDecisionAt > 90_000
    ) {
      autoOpenedRef.current = true;
      setModalOpen(true);
    }
  }, [block.awaitingApproval, decision, isLatestTurn]);

  const completedCount = entries.filter((e) => e.status === "completed").length;

  const handleApprove = (
    approved: { markdown?: string; entries: PlanBlockEntry[] },
    note?: string,
    continueAs: PlanExitIntent = "accept-edits",
  ) => {
    setDecision("approved");
    lastDecisionAt = Date.now();
    // Take the engine out of plan mode so the approval prompt actually runs
    // instead of triggering another ExitPlanMode → another modal, and land it
    // in the mode the user picked when they approved.
    onExitPlanMode?.(continueAs);

    let body: string;
    if (approved.markdown != null) {
      setMarkdown(approved.markdown);
      body = approved.markdown;
    } else {
      setEntries(approved.entries);
      body = approved.entries.map((e, i) => `${i + 1}. ${e.content}`).join("\n");
      onUpdatePlan?.({ entries: approved.entries, approved: true });
    }

    const prompt = note
      ? `Approved execution plan:\n\n${body}\n\nNote: ${note}\n\nProceed with executing this plan.`
      : `Approved execution plan:\n\n${body}\n\nProceed with executing this plan.`;
    onSend?.(prompt);
  };

  const handleReject = () => {
    setDecision("rejected");
    lastDecisionAt = Date.now();
    // Reject = stop. Don't nudge the agent to keep going — cancel the run and
    // leave plan mode. The user drives the next step themselves.
    onExitPlanMode?.();
    onStop?.();
  };

  if (decision === "rejected") {
    return (
      <div className="my-2 flex items-center gap-2 rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-xs text-muted-foreground">
        <XCircle className="size-3.5 text-agent-warn" />
        Plan rejected — asked the agent to rethink.
      </div>
    );
  }

  return (
    <>
      <Plan defaultOpen className="my-2 border border-border/70 bg-card/60">
        <PlanHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-agent-accent" />
            <PlanTitle className="text-sm font-semibold">
              {block.title ?? "Execution Plan"}
            </PlanTitle>
            {decision === "approved" || stale ? (
              <Badge
                variant="outline"
                className="border-agent-success font-mono text-[10px] uppercase text-agent-success"
              >
                Approved
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-agent-warn font-mono text-[10px] uppercase text-agent-warn"
              >
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
              {decision === "approved" || stale ? "View" : "Review & Approve"}
            </Button>
            <PlanTrigger />
          </div>
        </PlanHeader>

        {!isMarkdown && (
          <PlanDescription className="px-4 pb-2 text-xs text-muted-foreground">
            {`${completedCount} of ${entries.length} steps completed`}
          </PlanDescription>
        )}

        <PlanContent className="px-4 pb-3">
          {isMarkdown ? (
            <Prose size="xs">{markdown}</Prose>
          ) : (
            <div className="space-y-1.5">
              {entries.map((entry, idx) => (
                <div key={entry.id || idx} className="flex items-start gap-2 py-1 text-xs">
                  {entry.status === "completed" ? (
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-agent-success" />
                  ) : entry.status === "in_progress" ? (
                    <Clock className="mt-0.5 size-3.5 shrink-0 animate-spin text-agent-accent" />
                  ) : (
                    <Circle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span
                    className={`leading-relaxed ${
                      entry.status === "completed"
                        ? "text-muted-foreground line-through"
                        : "text-foreground"
                    }`}
                  >
                    <span className="mr-1.5 font-mono text-muted-foreground">{idx + 1}.</span>
                    {entry.content}
                  </span>
                </div>
              ))}
            </div>
          )}
        </PlanContent>

        {decision === "pending" && !stale && (
          <PlanFooter className="flex justify-end gap-2 border-t bg-muted/20 px-4 py-2">
            <Button
              type="button"
              variant="primary"
              size="xs"
              onClick={() => setModalOpen(true)}
              className="gap-1"
            >
              <Edit3 className="size-3" />
              Review &amp; Approve Plan
            </Button>
          </PlanFooter>
        )}
      </Plan>

      <PlanApprovalModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        markdown={isMarkdown ? markdown : undefined}
        entries={entries}
        engineLabel={engineLabel}
        onApprove={handleApprove}
        onReject={handleReject}
      />
    </>
  );
}
