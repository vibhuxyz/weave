import type {
  SessionConfigOption,
  SessionConfigSelectOption,
} from "@agentclientprotocol/sdk";

/**
 * ACP lets an agent send a select's values either flat or grouped by
 * `{ group, options }`. Nothing in the composer renders group headers, so
 * every caller here wants the same flattened list.
 */
export function flattenConfigValues(
  option: SessionConfigOption | undefined,
): SessionConfigSelectOption[] {
  if (!option || option.type !== "select") return [];
  return option.options.flatMap((entry) =>
    "group" in entry ? entry.options : [entry],
  );
}

const MODE_OPTION_ID = "mode";
const PLAN_MODE_ID = "plan";

/** What the user chose to happen once they approve a plan. */
export type PlanExitIntent = "accept-edits" | "default";

/** Mode ids worth landing on for each intent, best first. */
const PLAN_EXIT_PREFERENCES: Readonly<Record<PlanExitIntent, readonly string[]>> = {
  "accept-edits": ["acceptEdits", "accept-edits", "default"],
  default: ["default", "acceptEdits", "accept-edits"],
};

function isModeOption(option: SessionConfigOption): boolean {
  return option.category === MODE_OPTION_ID || option.id === MODE_OPTION_ID;
}

/**
 * Where to go when a plan is approved, chosen from the ids an agent actually
 * offers. Agents spell the same mode differently — Claude Code `acceptEdits`,
 * agy `accept-edits` — so the id is picked from their list, never assumed.
 */
export function planExitTarget(
  ids: readonly string[],
  intent: PlanExitIntent = "accept-edits",
): string | null {
  const preferred = PLAN_EXIT_PREFERENCES[intent].find((id) => ids.includes(id));
  return preferred ?? ids.find((id) => id !== PLAN_MODE_ID) ?? null;
}

export interface SplitConfigOptions {
  /**
   * Whether the composer already renders the agent's native session modes.
   *
   * agy advertises its `--mode` twice — as ACP session modes and as a `mode`
   * config option — and mirrors `session/set_mode` onto both. Rendering both
   * gives the composer two controls for one setting, which is how a chosen
   * mode ends up next to a pill still reading the old one.
   */
  readonly hasNativeModes: boolean;
}

export interface ComposerConfigOptions {
  /** The model selector, rendered as the agent picker's Model column. */
  model: SessionConfigOption | undefined;
  /** The agent's main selector — the one settings pill in the composer. */
  primary: SessionConfigOption | undefined;
  /** Every other knob, folded into the primary pill's menu. */
  children: SessionConfigOption[];
}

/**
 * Split what an agent advertises into the three slots the composer has.
 *
 * Agents disagree about what they expose — Claude Code sends mode, effort and
 * fast mode; Codex sends an approval policy, a sandbox and a reasoning effort.
 * Nothing here is keyed to a known id, so a new agent's knobs land in the same
 * places instead of spilling out as one pill each.
 */
export function splitConfigOptions(
  options: readonly SessionConfigOption[],
  { hasNativeModes }: SplitConfigOptions = { hasNativeModes: false },
): ComposerConfigOptions {
  // Booleans need a switch, not a menu — the composer renders selects only.
  const selects = options
    .filter((option) => option.type === "select")
    .filter((option) => !hasNativeModes || !isModeOption(option));

  // `category` is the agent's own answer, so it wins. The id fallback is an
  // exact match on purpose: `model_reasoning_effort` is not a model list.
  const model =
    selects.find((option) => option.category === "model") ??
    selects.find((option) => option.id === "model");

  const rest = selects.filter((option) => option !== model);
  const primary = rest.find(isModeOption) ?? rest[0];

  return {
    model,
    primary,
    children: rest.filter((option) => option !== primary),
  };
}
