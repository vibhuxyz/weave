import type { LanguageSpec } from "../types.ts";

const KEYWORDS = new Set([
  "if", "while", "for", "foreach", "switch", "return", "new", "catch", "try", "throw", "lock",
  "using", "namespace", "class", "interface", "struct", "enum", "record", "nameof", "typeof", "await",
]);

const MODIFIERS = "(?:public|private|protected|internal|static|sealed|abstract|virtual|override|async|partial|readonly)";

export const CSHARP: LanguageSpec = {
  language: "csharp",
  extensions: [".cs"],
  lineComments: ["//"],
  blockComments: [["/*", "*/"]],
  scope: "brace",
  imports: [{ pattern: /^[ \t]*(?:global[ \t]+)?using[ \t]+(?:static[ \t]+)?([A-Za-z_][\w.]*)[ \t]*;/, specifierGroup: 1 }],
  symbols: [
    { pattern: new RegExp(`^[ \\t]*(?:${MODIFIERS}[ \\t]+)*class[ \\t]+([A-Za-z_]\\w*)`), nameGroup: 1, kind: "class", opensScope: true },
    { pattern: new RegExp(`^[ \\t]*(?:${MODIFIERS}[ \\t]+)*interface[ \\t]+([A-Za-z_]\\w*)`), nameGroup: 1, kind: "interface", opensScope: true },
    { pattern: new RegExp(`^[ \\t]*(?:${MODIFIERS}[ \\t]+)*record[ \\t]+([A-Za-z_]\\w*)`), nameGroup: 1, kind: "class", opensScope: true },
    { pattern: new RegExp(`^[ \\t]*(?:${MODIFIERS}[ \\t]+)*struct[ \\t]+([A-Za-z_]\\w*)`), nameGroup: 1, kind: "class", opensScope: true },
    { pattern: new RegExp(`^[ \\t]*(?:${MODIFIERS}[ \\t]+)*enum[ \\t]+([A-Za-z_]\\w*)`), nameGroup: 1, kind: "enum", opensScope: false },
    { pattern: new RegExp(`^[ \\t]*(?:${MODIFIERS}[ \\t]+)+[\\w<>\\[\\],.?]+[ \\t]+([A-Za-z_]\\w*)[ \\t]*\\(`), nameGroup: 1, kind: "function", opensScope: true },
  ],
  keywords: KEYWORDS,
  isExported: (_name, line) => /\b(public|internal)\b/.test(line),
};
