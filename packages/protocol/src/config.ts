/**
 * Knobs a run can be varied on. The eval harness sweeps these, so every field
 * here is a dimension a comparison can be made along.
 */
export interface RunConfig {
  /** Short, stable id used in reports and ledgers, e.g. "opus-high". */
  id?: string;
  /** Which ACP engine. See packages/agent/src/engines.ts. */
  engine?: string;

  // Agent settings, applied via setSessionConfigOption once the session opens.
  // These are `configOptions` values, not a separate model API — Claude Code
  // does not populate newSession().models.
  model?: string;
  mode?: string;
  effort?: string;
  fast?: "on" | "off";

  /**
   * Cap on tool calls in one task.
   *
   * NOT ACP turns: a task is a single `prompt` call, and the agent's internal
   * loop is invisible to us. Tool calls are the only runaway signal that
   * crosses the wire, so that is what this counts. Exceeding it cancels the
   * task and reports `timeout`.
   */
  maxTurns?: number;
  /** Wall-clock cap for one task. Exceeding it cancels and reports `timeout`. */
  timeoutMs?: number;

  /** Where runs are written. Defaults to `<cwd>/.weave`. */
  weaveDir?: string;
}

/**
 * Defaults exist so an unattended overnight run cannot burn budget until
 * morning. A looping agent is the expected failure, not a rare one.
 */
export const DEFAULT_RUN_CONFIG = {
  engine: "claude-code",
  maxTurns: 60,
  timeoutMs: 10 * 60 * 1000,
} satisfies RunConfig;

/** Raw config values the agent accepted or refused, for the ledger. */
export function agentConfigFrom(config: RunConfig): Record<string, string> {
  const out: Record<string, string> = {};
  if (config.model) out.model = config.model;
  if (config.mode) out.mode = config.mode;
  if (config.effort) out.effort = config.effort;
  if (config.fast) out.fast = config.fast;
  return out;
}

/** A stable label for a config, used as a column header. */
export function configId(config: RunConfig): string {
  if (config.id) return config.id;
  return (
    [config.engine, config.model, config.effort, config.fast && `fast-${config.fast}`]
      .filter(Boolean)
      .join("-") || "default"
  );
}
