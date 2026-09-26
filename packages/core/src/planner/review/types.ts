import type { TaskContract } from "@weave/protocol";
import type { REVIEW_ISSUE_TYPES } from "./constants.ts";

export type ReviewTurn = (prompt: string, signal?: AbortSignal) => Promise<string>;

export type ReviewableTask = Pick<
  TaskContract,
  "id" | "prompt" | "allowedPaths" | "readOnlyPaths" | "dependencies" | "employee" | "skills" | "complexity" | "verifyRung"
> & { readonly title: string };

export type ReviewIssueType = (typeof REVIEW_ISSUE_TYPES)[number];

export interface ReviewIssue {
  readonly type: ReviewIssueType;
  readonly taskIds: readonly string[];
  readonly reason: string;
}

export type ReviewVerdict =
  | { readonly status: "approved" }
  | { readonly status: "changes_requested"; readonly issues: readonly ReviewIssue[] };

export type ParseReviewResult =
  | { readonly ok: true; readonly verdict: ReviewVerdict }
  | { readonly ok: false; readonly issues: readonly string[] };

export interface Critique {
  readonly outcome: "approved" | "revised" | "kept";
  readonly issues: readonly ReviewIssue[];
}

export interface ReviewGateInput {
  readonly taskCount: number;
  readonly risk: string | null;
  readonly scope: string | null;
}

export interface RunReviewInput<P> {
  readonly plannerPrompt: string;
  readonly tasks: readonly ReviewableTask[];
  readonly reviewTurn: ReviewTurn;
  readonly revise: (prompt: string) => Promise<P | null>;
  readonly signal?: AbortSignal;
}

export interface ReviewRun<P> {
  readonly critique: Critique;
  readonly revised: P | null;
  readonly warnings: readonly string[];
}
