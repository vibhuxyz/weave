import type { ApiFact, CommitSummary, EventFact, SymbolFact } from "../types.ts";

export type Intent = "api" | "ui" | "data" | "event" | "test";

export interface RequestTerms {
  readonly terms: readonly string[];
  readonly intents: ReadonlySet<Intent>;
}

export interface RankedFile {
  readonly path: string;
  readonly workspace: string | null;
  readonly score: number;
  readonly matchedTerms: readonly string[];
  readonly reasons: readonly string[];
}

export interface RankedSymbol {
  readonly symbol: SymbolFact;
  readonly matchedTerms: readonly string[];
}

export interface VerificationStep {
  readonly command: string;
  readonly cwd: string;
}

export interface ProjectAnswer {
  readonly request: string;
  readonly terms: readonly string[];
  readonly application: { readonly name: string; readonly dir: string; readonly kind: string } | null;
  readonly files: readonly RankedFile[];
  readonly symbols: readonly RankedSymbol[];
  readonly dependencies: {
    readonly imports: readonly string[];
    readonly dependents: readonly string[];
    readonly callers: readonly string[];
    readonly callees: readonly string[];
  };
  readonly apis: readonly ApiFact[];
  readonly events: readonly EventFact[];
  readonly recentChanges: readonly CommitSummary[];
  readonly verification: { readonly tests: readonly string[]; readonly commands: readonly VerificationStep[] };
}
