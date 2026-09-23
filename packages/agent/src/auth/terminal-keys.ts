/**
 * The keys a TUI wizard needs, and nothing else.
 *
 * The renderer sends a key *name*, never bytes: escape sequences reaching a
 * live PTY are untrusted input, and an allowlist is the only way to be sure a
 * client cannot inject arbitrary control codes into the agent's terminal.
 */
const TERMINAL_KEYS = {
  up: "\x1b[A",
  down: "\x1b[B",
  right: "\x1b[C",
  left: "\x1b[D",
  enter: "\r",
  space: " ",
  tab: "\t",
  escape: "\x1b",
} as const satisfies Record<string, string>;

export type TerminalKeyName = keyof typeof TERMINAL_KEYS;

export const TERMINAL_KEY_NAMES: readonly TerminalKeyName[] = Object.keys(
  TERMINAL_KEYS,
) as TerminalKeyName[];

export function isTerminalKeyName(value: unknown): value is TerminalKeyName {
  return typeof value === "string" && value in TERMINAL_KEYS;
}

export function terminalKeySequence(name: TerminalKeyName): string {
  return TERMINAL_KEYS[name];
}
