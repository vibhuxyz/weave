import { DOUBLE_QUOTE_ESCAPE, LINE_CONTINUATION, SHELL_TOKEN } from "./constants.ts";
import type { ShellToken } from "./types.ts";

type TokenGroups = Partial<Record<"single" | "double" | "escaped" | "operator" | "space" | "bare", string>>;

function wordPiece(groups: TokenGroups): string {
  if (groups.escaped === LINE_CONTINUATION) return "";
  return groups.single ?? groups.double?.replace(DOUBLE_QUOTE_ESCAPE, "$1") ?? groups.escaped ?? groups.bare ?? "";
}

export function tokenizeShell(command: string): readonly ShellToken[] {
  const tokens: ShellToken[] = [];
  const pieces: string[] = [];
  const endWord = (): void => {
    if (pieces.length > 0) tokens.push({ kind: "word", text: pieces.join("") });
    pieces.length = 0;
  };
  for (const match of command.matchAll(SHELL_TOKEN)) {
    const groups: TokenGroups = match.groups ?? {};
    if (groups.operator === undefined && groups.space === undefined) {
      pieces.push(wordPiece(groups));
      continue;
    }
    endWord();
    if (groups.operator !== undefined) tokens.push({ kind: "operator", text: groups.operator });
  }
  endWord();
  return tokens;
}

export function splitShellWords(command: string): readonly string[] {
  return tokenizeShell(command).flatMap((token) => (token.kind === "word" ? [token.text] : []));
}
