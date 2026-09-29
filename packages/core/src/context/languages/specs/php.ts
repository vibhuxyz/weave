import type { LanguageSpec } from "../types.ts";

const KEYWORDS = new Set([
  "if", "elseif", "while", "for", "foreach", "switch", "return", "echo", "print", "isset", "unset",
  "empty", "array", "new", "function", "class", "use", "require", "include", "catch", "throw", "match",
]);

const VISIBILITY = "(?:public|private|protected|static|final|abstract|readonly)";

export const PHP: LanguageSpec = {
  language: "php",
  extensions: [".php"],
  lineComments: ["//", "#"],
  blockComments: [["/*", "*/"]],
  scope: "brace",
  imports: [
    { pattern: /^[ \t]*use[ \t]+([A-Za-z_][\w\\]*)/, specifierGroup: 1 },
    { pattern: /^[ \t]*(?:require|include)(?:_once)?[ \t]*\(?[ \t]*['"]([^'"]+)['"]/, specifierGroup: 1 },
  ],
  symbols: [
    { pattern: /^[ \t]*(?:final[ \t]+|abstract[ \t]+)*class[ \t]+([A-Za-z_]\w*)/, nameGroup: 1, kind: "class", opensScope: true },
    { pattern: /^[ \t]*interface[ \t]+([A-Za-z_]\w*)/, nameGroup: 1, kind: "interface", opensScope: true },
    { pattern: /^[ \t]*trait[ \t]+([A-Za-z_]\w*)/, nameGroup: 1, kind: "class", opensScope: true },
    { pattern: /^[ \t]*enum[ \t]+([A-Za-z_]\w*)/, nameGroup: 1, kind: "enum", opensScope: true },
    { pattern: new RegExp(`^[ \\t]*(?:${VISIBILITY}[ \\t]+)*function[ \\t]+([A-Za-z_]\\w*)`), nameGroup: 1, kind: "function", opensScope: true },
    { pattern: /^[ \t]*const[ \t]+([A-Z_][A-Z0-9_]*)/, nameGroup: 1, kind: "variable", opensScope: false },
  ],
  keywords: KEYWORDS,
  isExported: (_name, line) => !/\b(private|protected)\b/.test(line),
};
