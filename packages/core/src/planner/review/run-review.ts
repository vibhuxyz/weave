import { buildReviewPrompt, buildRevisionPrompt } from "./prompt.ts";
import { parseReview } from "./parse-review.ts";
import type { ReviewIssue, ReviewRun, RunReviewInput } from "./types.ts";

type ReviewerReply = { readonly ok: true; readonly text: string } | { readonly ok: false; readonly note: string };

function isAbort(error: unknown, signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true || (error instanceof Error && error.name === "AbortError");
}

async function askReviewer<P>(input: RunReviewInput<P>): Promise<ReviewerReply> {
  try {
    return { ok: true, text: await input.reviewTurn(buildReviewPrompt(input.plannerPrompt, input.tasks), input.signal) };
  } catch (error) {
    if (isAbort(error, input.signal) || !(error instanceof Error)) throw error;
    return { ok: false, note: `The plan review could not run: ${error.message}` };
  }
}

function kept<P>(issues: readonly ReviewIssue[], note: string): ReviewRun<P> {
  return { critique: { outcome: "kept", issues }, revised: null, warnings: [note] };
}

export async function runReview<P>(input: RunReviewInput<P>): Promise<ReviewRun<P>> {
  const reply = await askReviewer(input);
  if (!reply.ok) return kept([], reply.note);
  const parsed = parseReview(reply.text, new Set(input.tasks.map((task) => task.id)));
  if (!parsed.ok) return kept([], `The plan review reply was invalid, so the plan was kept: ${parsed.issues.join("; ")}`);
  if (parsed.verdict.status === "approved") return { critique: { outcome: "approved", issues: [] }, revised: null, warnings: [] };
  const { issues } = parsed.verdict;
  const revised = await input.revise(buildRevisionPrompt(input.plannerPrompt, input.tasks, issues));
  if (revised === null) return kept(issues, "The revised plan was invalid, so the plan the reviewer saw was kept");
  return { critique: { outcome: "revised", issues }, revised, warnings: [] };
}
