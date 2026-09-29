import { JOIN_BY_OPERATOR, SEQUENCE_OPERATORS } from "./constants.ts";
import type { ShellItem, ShellJoin, ShellToken } from "./types.ts";

export function parseShellItems(tokens: readonly ShellToken[]): readonly ShellItem[] {
  const items: ShellItem[] = [];
  let commands: string[][] = [[]];
  let joins: ShellJoin[] = [];
  for (const token of tokens) {
    if (token.kind === "word") {
      commands.at(-1)?.push(token.text);
      continue;
    }
    if (SEQUENCE_OPERATORS.has(token.text)) {
      items.push({ commands, joins });
      commands = [[]];
      joins = [];
      continue;
    }
    const join = JOIN_BY_OPERATOR.get(token.text);
    if (join === undefined) continue;
    joins.push(join);
    commands.push([]);
  }
  items.push({ commands, joins });
  return items;
}
