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
  options: SessionConfigOption[],
): ComposerConfigOptions {
  // Booleans need a switch, not a menu — the composer renders selects only.
  const selects = options.filter((option) => option.type === "select");

  // `category` is the agent's own answer, so it wins. The id fallback is an
  // exact match on purpose: `model_reasoning_effort` is not a model list.
  const model =
    selects.find((option) => option.category === "model") ??
    selects.find((option) => option.id === "model");

  const rest = selects.filter((option) => option !== model);
  const primary =
    rest.find((option) => option.category === "mode" || option.id === "mode") ??
    rest[0];

  return {
    model,
    primary,
    children: rest.filter((option) => option !== primary),
  };
}
