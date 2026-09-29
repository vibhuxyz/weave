import { DOUBLE_QUOTE_ESCAPE, SHELL_TOKEN } from "./constants.ts";

type TokenGroups = Partial<Record<"single" | "double" | "escaped" | "separator" | "bare", string>>;

function unquote(groups: TokenGroups): string {
  return groups.single ?? groups.double?.replace(DOUBLE_QUOTE_ESCAPE, "$1") ?? groups.escaped ?? groups.bare ?? "";
}

export function splitShellWords(command: string): readonly string[] {
  const words: string[] = [];
  const parts: string[] = [];
  for (const match of command.matchAll(SHELL_TOKEN)) {
    const groups: TokenGroups = match.groups ?? {};
    if (groups.separator === undefined) {
      parts.push(unquote(groups));
      continue;
    }
    if (parts.length > 0) words.push(parts.join(""));
    parts.length = 0;
  }
  if (parts.length > 0) words.push(parts.join(""));
  return words;
}
