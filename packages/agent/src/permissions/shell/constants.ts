import type { ShellJoin } from "./types.ts";

export const SHELL_TOKEN =
  /'(?<single>[^']*)'?|"(?<double>(?:\\[\s\S]|\$\((?:[^()"']|"[^"]*"|'[^']*')*\)|[^"\\])*)"?|\\(?<escaped>[\s\S]?)|(?<operator>&&|\|\||>>|>&|<&|&>|[|&;()<>\n])|(?<space>[^\S\n]+)|(?<bare>[^'"\\\s|&;<>()]+)/g;

export const DOUBLE_QUOTE_ESCAPE = /\\([$`"\\\n])/g;
export const LINE_CONTINUATION = "\n";

export const SEQUENCE_OPERATORS: ReadonlySet<string> = new Set([";", "\n"]);
export const JOIN_BY_OPERATOR: ReadonlyMap<string, ShellJoin> = new Map([
  ["&&", "and"],
  ["||", "or"],
  ["|", "pipe"],
  ["&", "background"],
  ["(", "group"],
  [")", "group"],
]);

export const CD_COMMAND = "cd";
export const DIRECTORY_COMMANDS: ReadonlySet<string> = new Set([CD_COMMAND, "pushd", "popd"]);
export const UNRESOLVABLE_CD_ARGUMENT = /^[-~]|[$`]/;

export const PARENT_SEGMENT = /(?:^|\/)\.\.(?:\/|$)/;
export const PATH_PART_SEPARATOR = /[`=:"'()]|\$\(/;
export const WHITESPACE = /\s+/;
