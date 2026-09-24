import type { DependencyNeed } from "@weave/protocol";
import type { ArtifactInput } from "../dependencies/index.ts";

export type ArtifactSubmissionType = "artifact.ready" | "artifact.updated" | "contract.published" | "contract.changed";

export type EmployeeSubmission =
  | { readonly type: ArtifactSubmissionType; readonly data: { readonly artifact: ArtifactInput } }
  | { readonly type: "task.blocked"; readonly data: { readonly reason: string } }
  | { readonly type: "dependency.blocked"; readonly data: { readonly need: DependencyNeed; readonly reason: string } }
  | { readonly type: "review.requested" | "verification.failed" | "verification.passed"; readonly data: { readonly summary: string } }
  | { readonly type: "escalation.created"; readonly data: { readonly reason: string; readonly subject: string } };

export type ParseSubmissionResult =
  | { readonly ok: true; readonly submission: EmployeeSubmission }
  | { readonly ok: false; readonly issues: readonly string[] };
