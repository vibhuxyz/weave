import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { PromptCardButton } from "@/features/chat/components";
import { cn } from "@/shared/lib";
import type { ResultDecision, RunReview, RunReviewWorker } from "../../../../../server/index.ts";
import { SHORT_SHA_LENGTH } from "../../constants";
import { selectResultReview, useRunStore } from "../../store";
import { WORKER_STATE_CLASS, WORKER_STATE_LABEL } from "../status-style";

const REVIEW_LABEL = {
  ok: "Verified: every check passed after each merge",
  unverified: "Merged, but not verified",
  failed: "Checks failed after merging",
  "not-merged": "Nothing was merged",
} as const satisfies Record<RunReview["status"], string>;

const REVIEW_CLASS = {
  ok: "text-agent-success",
  unverified: "text-agent-warn",
  failed: "text-agent-critical-fg",
  "not-merged": "text-agent-warn",
} as const satisfies Record<RunReview["status"], string>;

function workerFacts(worker: RunReviewWorker): string {
  const files = `${worker.fileCount} file${worker.fileCount === 1 ? "" : "s"}`;
  const checks = worker.checks.length > 0 ? ` · checked with ${worker.checks.join(", ")}` : "";
  const commit = worker.commit ? ` · ${worker.commit.slice(0, SHORT_SHA_LENGTH)}` : "";
  return `${files}${checks}${commit}`;
}

function ReviewWorkers({ workers, hiddenWorkerCount }: Pick<RunReview, "workers" | "hiddenWorkerCount">) {
  if (workers.length === 0) return null;
  return (
    <ul aria-label="Workers" className="flex flex-col gap-1 text-[11px]">
      {workers.map((worker) => (
        <li key={worker.taskId} className="flex flex-col">
          <span>
            <span className="font-medium text-agent-text-bright">{worker.taskId}</span>
            <span className={WORKER_STATE_CLASS[worker.state]}> · {WORKER_STATE_LABEL[worker.state]}</span>
            <span className="text-agent-text-faint"> · {workerFacts(worker)}</span>
          </span>
          {worker.reason && <span className="truncate text-agent-text-muted" title={worker.reason}>{worker.reason}</span>}
        </li>
      ))}
      {hiddenWorkerCount > 0 && <li className="text-agent-text-faint">(+{hiddenWorkerCount} more)</li>}
    </ul>
  );
}

interface ResultActionsProps {
  readonly runKey: string;
  readonly canAccept: boolean;
  readonly onDecideResult: (runKey: string, decision: ResultDecision) => void;
}

function ResultActions({ runKey, canAccept, onDecideResult }: ResultActionsProps) {
  const [isSending, setIsSending] = useState(false);
  const decide = (decision: ResultDecision) => {
    setIsSending(true);
    onDecideResult(runKey, decision);
  };
  return (
    <div className="flex flex-wrap gap-2">
      <PromptCardButton disabled={isSending} onClick={() => decide("discard")}>Discard</PromptCardButton>
      <PromptCardButton variant="primary" disabled={isSending || !canAccept} onClick={() => decide("accept")}>Accept and commit</PromptCardButton>
    </div>
  );
}

interface ResultReviewProps {
  readonly onDecideResult: (runKey: string, decision: ResultDecision) => void;
}

export function ResultReview({ onDecideResult }: ResultReviewProps) {
  const { runKey, outcome, decision } = useRunStore(useShallow(selectResultReview));
  if (runKey === null || outcome?.status !== "ran" || outcome.review === null) return null;
  const { review } = outcome;
  if (decision && decision.status !== "refused") return <p className="text-agent-text-muted text-xs">{decision.summary}</p>;
  return (
    <section aria-label="Run result" className="flex flex-col gap-2 rounded-xl border border-agent-border/60 p-3 text-xs">
      <span className={cn("font-medium", REVIEW_CLASS[review.status])}>{REVIEW_LABEL[review.status]}</span>
      <p className="text-agent-text-muted">{review.detail}</p>
      <ReviewWorkers workers={review.workers} hiddenWorkerCount={review.hiddenWorkerCount} />
      <ul className="flex flex-col gap-0.5 font-mono text-[11px] text-agent-text-faint">
        {review.files.map((file) => <li key={file}>{file}</li>)}
        {review.hiddenFileCount > 0 && <li>(+{review.hiddenFileCount} more)</li>}
      </ul>
      {decision?.status === "refused" && <p className="text-agent-critical-fg">{decision.summary}</p>}
      <ResultActions key={decision?.summary ?? "undecided"} runKey={runKey} canAccept={review.canAccept} onDecideResult={onDecideResult} />
    </section>
  );
}
