import { escapeClosingTag } from "../shared/index.ts";
import { ESTIMATE_TAG, MS_PER_MINUTE } from "./constants.ts";
import type { ProposedWorker, TeamEstimate } from "./types.ts";

function minutes(ms: number): string {
  return `${Math.max(1, Math.round(ms / MS_PER_MINUTE))} min`;
}

function workerLine(worker: ProposedWorker): string {
  const role = worker.role ?? "any worker";
  const start = worker.after.length === 0 ? "starts now" : `starts after worker ${worker.after.join(", ")}`;
  return `- Worker ${worker.worker} (${role}) in ${worker.areas.join(", ")}, ${start}, about ${minutes(worker.estimatedMs)}: ${worker.items.join("; ")}`;
}

export function renderEstimate(estimate: TeamEstimate): string {
  const teamSize = estimate.workers.length;
  const verdict = estimate.recommendation === "team" ? `Recommendation: ask a team to finish (${teamSize} workers).` : "Recommendation: keep going yourself.";
  const rough = estimate.isRough ? ` Rough: only ${estimate.historyRuns} past run(s) to learn from.` : "";
  return [
    verdict,
    `Why: ${estimate.reason}`,
    `Time: one worker about ${minutes(estimate.oneWorkerMs)}; the team about ${minutes(estimate.teamMs)}.${rough}`,
    "Workers:",
    ...estimate.workers.map(workerLine),
  ].join("\n");
}

export function renderEstimateNotes(estimate: TeamEstimate): string {
  const body = escapeClosingTag(renderEstimate(estimate), ESTIMATE_TAG);
  return `<${ESTIMATE_TAG} source="computed by Weave from the project model and past runs, for the chat agent's remaining work">\n${body}\n</${ESTIMATE_TAG}>`;
}
