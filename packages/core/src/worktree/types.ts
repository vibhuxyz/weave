export type WorktreeResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: string };

export interface Harvest {
  readonly commit: string | null;
  readonly files: readonly string[];
}

export type InstallOutcome =
  | { readonly status: "skipped"; readonly reason: string }
  | {
      readonly status: "ok" | "failed";
      readonly command: string;
      readonly durationMs: number;
      readonly outputTail: string;
    };
