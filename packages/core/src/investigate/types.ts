export const QUESTION_KINDS = [
  "creation",
  "persistence",
  "validation",
  "expiry",
  "consistency",
  "tests",
  "other",
] as const;

export type QuestionKind = (typeof QUESTION_KINDS)[number];

export interface Question {
  readonly id: string;
  readonly question: string;
  readonly kind: QuestionKind;
  readonly expectedOutputs: readonly string[];
}

export interface QuestionSet {
  readonly request: string;
  readonly questions: readonly Question[];
}

export type QuestionOutcome =
  | { readonly ok: true; readonly questions: QuestionSet; readonly attempts: number }
  | { readonly ok: false; readonly issues: readonly string[]; readonly attempts: number };

export interface DiscoveryScope {
  readonly files: readonly string[];
  readonly symbols: readonly string[];
  readonly reasons: readonly string[];
}

export interface DiscoveryTask {
  readonly id: string;
  readonly questionId: string;
  readonly question: string;
  readonly scope: DiscoveryScope;
  readonly context: string;
  readonly constraints: readonly string[];
  readonly expectedOutputs: readonly string[];
}

export interface Evidence {
  readonly file: string;
  readonly symbol: string | null;
  readonly line: number | null;
  readonly detail: string | null;
}

export const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;

export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export interface Finding {
  readonly id: string;
  readonly questionId: string;
  readonly worker: string;
  readonly finding: string;
  readonly hypothesis: string | null;
  readonly confidence: Confidence;
  readonly evidence: readonly Evidence[];
}

export type EvidenceNodeKind = "finding" | "file" | "symbol";

export interface EvidenceNode {
  readonly id: string;
  readonly kind: EvidenceNodeKind;
  readonly label: string;
}

export type EvidenceLinkKind = "supports" | "corroborates" | "contains";

export interface EvidenceLink {
  readonly from: string;
  readonly to: string;
  readonly kind: EvidenceLinkKind;
}

export interface EvidenceGraph {
  readonly findings: readonly Finding[];
  readonly nodes: readonly EvidenceNode[];
  readonly links: readonly EvidenceLink[];
  readonly rejected: readonly { readonly worker: string; readonly reason: string }[];
}

export interface RootCause {
  readonly hypothesis: string;
  readonly score: number;
  readonly supportedBy: readonly string[];
  readonly questionIds: readonly string[];
  readonly sharedEvidence: readonly string[];
}

export interface RootCauseReport {
  readonly request: string;
  readonly causes: readonly RootCause[];
  readonly unanswered: readonly string[];
}
