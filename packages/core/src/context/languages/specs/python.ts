import type { LanguageSpec } from "../types.ts";

const KEYWORDS = new Set([
  "if", "elif", "while", "for", "return", "print", "assert", "with", "except", "yield", "lambda",
  "def", "class", "import", "not", "and", "or", "in", "is", "raise", "del", "super",
]);

export const PYTHON: LanguageSpec = {
  language: "python",
  extensions: [".py", ".pyi"],
  lineComments: ["#"],
  blockComments: [['"""', '"""'], ["'''", "'''"]],
  scope: "indent",
  imports: [
    { pattern: /^[ \t]*from[ \t]+([.\w]+)[ \t]+import[ \t]+(.+)$/, specifierGroup: 1, bindingsGroup: 2 },
    { pattern: /^[ \t]*import[ \t]+([.\w]+)/, specifierGroup: 1 },
  ],
  symbols: [
    { pattern: /^[ \t]*class[ \t]+([A-Za-z_]\w*)/, nameGroup: 1, kind: "class", opensScope: true },
    { pattern: /^[ \t]*(?:async[ \t]+)?def[ \t]+([A-Za-z_]\w*)/, nameGroup: 1, kind: "function", opensScope: true },
    { pattern: /^([A-Z_][A-Z0-9_]*)[ \t]*(?::[^=]+)?=/, nameGroup: 1, kind: "variable", opensScope: false },
  ],
  keywords: KEYWORDS,
  isExported: (name) => !name.startsWith("_"),
};
