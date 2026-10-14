export interface TeamHandoff {
  readonly reason: string;
  readonly done: readonly string[];
  readonly remaining: readonly string[];
  readonly findings: readonly string[];
}

export type HandoffParse =
  | { readonly ok: true; readonly handoff: TeamHandoff }
  | { readonly ok: false; readonly issues: readonly string[] };

export type HandoffReading =
  | { readonly kind: "none" }
  | { readonly kind: "invalid"; readonly issue: string }
  | { readonly kind: "handoff"; readonly handoff: TeamHandoff };

export interface TurnActivity {
  readonly text: string;
  readonly uncommitted: readonly string[];
}

export type HandoffVerdict =
  | { readonly kind: "none" }
  | { readonly kind: "invalid"; readonly issue: string }
  | { readonly kind: "team"; readonly handoff: TeamHandoff; readonly uncommitted: readonly string[] };
