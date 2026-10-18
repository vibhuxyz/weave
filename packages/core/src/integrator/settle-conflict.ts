import { concludeMerge, describeConflict, listFiles, rollBackMerge, type MergeAttempt } from "./merge.ts";
import type { MergeCandidate, ResolveConflict } from "./types.ts";

export type SettledMerge =
  | { readonly status: "merged"; readonly commit: string; readonly note: string | null }
  | { readonly status: "conflict" | "merge-error"; readonly detail: string };

export interface ConflictInput {
  readonly cwd: string;
  readonly head: string;
  readonly candidate: MergeCandidate;
  readonly files: readonly string[];
  readonly resolve: ResolveConflict | undefined;
}

export function settledAttempt(attempt: Exclude<MergeAttempt, { readonly status: "conflict" }>): SettledMerge {
  return attempt.status === "merged" ? { status: "merged", commit: attempt.commit, note: null } : attempt;
}

async function giveUp(input: ConflictInput, detail: string): Promise<SettledMerge> {
  const rollBackProblem = await rollBackMerge(input.cwd, input.head);
  return rollBackProblem === null ? { status: "conflict", detail } : { status: "merge-error", detail: `${detail}; ${rollBackProblem}` };
}

function whyNotConcluded(concluded: Exclude<MergeAttempt, { readonly status: "merged" }>): string {
  return concluded.status === "conflict" ? `conflict markers or unmerged paths remain in ${listFiles(concluded.files)}` : concluded.detail;
}

export async function settleConflict(input: ConflictInput): Promise<SettledMerge> {
  const conflict = describeConflict(input.files);
  if (!input.resolve) return giveUp(input, conflict);
  const fixed = await input.resolve({ cwd: input.cwd, taskId: input.candidate.taskId, branch: input.candidate.branch, files: input.files });
  if (!fixed.ok) return giveUp(input, `${conflict}; Weave could not resolve them: ${fixed.reason}`);
  const concluded = await concludeMerge(input.cwd, input.files);
  if (concluded.status === "merged") return { status: "merged", commit: concluded.commit, note: `resolved ${conflict}` };
  return giveUp(input, `${conflict}; Weave's resolution did not hold: ${whyNotConcluded(concluded)}`);
}
