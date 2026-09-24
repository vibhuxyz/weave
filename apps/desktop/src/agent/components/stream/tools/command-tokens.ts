export type CommandTokenKind = "command" | "flag" | "string" | "operator" | "space" | "word";

export interface CommandToken {
  readonly kind: CommandTokenKind;
  readonly text: string;
}

const TOKEN_PATTERN = /"(?:\\.|[^"\\])*"?|'[^']*'?|\s+|&&|\|\||[|;]|[^\s|;&"']+|./g;
const OPERATORS: ReadonlySet<string> = new Set(["&&", "||", "|", ";"]);

function kindOf(text: string, expectsCommand: boolean): CommandTokenKind {
  if (/^\s+$/.test(text)) return "space";
  if (OPERATORS.has(text)) return "operator";
  if (text.startsWith('"') || text.startsWith("'")) return "string";
  if (expectsCommand) return "command";
  return text.startsWith("-") ? "flag" : "word";
}

export function tokenizeCommand(command: string): readonly CommandToken[] {
  const texts = command.match(TOKEN_PATTERN) ?? [];
  return texts.reduce<{ readonly tokens: readonly CommandToken[]; readonly expectsCommand: boolean }>(
    (state, text) => {
      const kind = kindOf(text, state.expectsCommand);
      const expectsCommand = kind === "operator" || (kind === "space" && state.expectsCommand);
      return { tokens: [...state.tokens, { kind, text }], expectsCommand };
    },
    { tokens: [], expectsCommand: true },
  ).tokens;
}
