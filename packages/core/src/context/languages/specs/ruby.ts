import type { LanguageSpec } from "../types.ts";

const KEYWORDS = new Set([
  "if", "unless", "while", "until", "return", "puts", "require", "def", "class", "module",
  "do", "end", "yield", "raise", "rescue", "begin", "then", "new", "attr_accessor", "attr_reader",
]);

export const RUBY: LanguageSpec = {
  language: "ruby",
  extensions: [".rb"],
  lineComments: ["#"],
  blockComments: [["=begin", "=end"]],
  scope: "indent",
  imports: [
    { pattern: /^[ \t]*require(?:_relative)?[ \t]+["']([^"']+)["']/, specifierGroup: 1 },
  ],
  symbols: [
    { pattern: /^[ \t]*class[ \t]+([A-Za-z_]\w*)/, nameGroup: 1, kind: "class", opensScope: true },
    { pattern: /^[ \t]*module[ \t]+([A-Za-z_]\w*)/, nameGroup: 1, kind: "class", opensScope: true },
    { pattern: /^[ \t]*def[ \t]+(?:self\.)?([A-Za-z_]\w*[?!]?)/, nameGroup: 1, kind: "function", opensScope: true },
    { pattern: /^[ \t]*([A-Z][A-Z0-9_]*)[ \t]*=/, nameGroup: 1, kind: "variable", opensScope: false },
  ],
  keywords: KEYWORDS,
  isExported: (name) => !name.startsWith("_"),
};
