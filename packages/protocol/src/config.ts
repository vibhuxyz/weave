/** Knobs a run can be varied on. The eval harness sweeps these. */
export interface RunConfig {
  /** Agent settings, applied via `setSessionConfigOption` after the session opens. */
  agentConfig?: Record<string, string>;
  /** How many agents may work at once. 1 until the pool exists. */
  concurrency?: number;
  /** Resume the project's previous session instead of starting fresh. */
  resume?: boolean;
  /** Where runs are written. Defaults to `<cwd>/.berd`. */
  berdDir?: string;
}

export const DEFAULT_RUN_CONFIG: Required<
  Pick<RunConfig, "concurrency" | "resume">
> = {
  concurrency: 1,
  resume: false,
};
