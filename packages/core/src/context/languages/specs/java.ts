import type { LanguageSpec } from "../types.ts";

const KEYWORDS = new Set([
  "if", "for", "while", "switch", "return", "new", "catch", "try", "synchronized", "super", "this",
  "throw", "throws", "class", "interface", "enum", "record", "import", "package", "assert",
]);

const MODIFIERS = "(?:public|private|protected|static|final|abstract|synchronized|native|default)";

export const JAVA: LanguageSpec = {
  language: "java",
  extensions: [".java"],
  lineComments: ["//"],
  blockComments: [["/*", "*/"]],
  scope: "brace",
  imports: [{ pattern: /^[ \t]*import[ \t]+(?:static[ \t]+)?([\w.]+)/, specifierGroup: 1 }],
  symbols: [
    { pattern: new RegExp(`^[ \\t]*(?:${MODIFIERS}[ \\t]+)*class[ \\t]+([A-Za-z_]\\w*)`), nameGroup: 1, kind: "class", opensScope: true },
    { pattern: new RegExp(`^[ \\t]*(?:${MODIFIERS}[ \\t]+)*interface[ \\t]+([A-Za-z_]\\w*)`), nameGroup: 1, kind: "interface", opensScope: true },
    { pattern: new RegExp(`^[ \\t]*(?:${MODIFIERS}[ \\t]+)*enum[ \\t]+([A-Za-z_]\\w*)`), nameGroup: 1, kind: "enum", opensScope: true },
    { pattern: new RegExp(`^[ \\t]*(?:${MODIFIERS}[ \\t]+)*record[ \\t]+([A-Za-z_]\\w*)`), nameGroup: 1, kind: "class", opensScope: true },
    { pattern: new RegExp(`^[ \\t]*(?:${MODIFIERS}[ \\t]+)+[\\w<>\\[\\],.? ]+[ \\t]+([A-Za-z_]\\w*)[ \\t]*\\(`), nameGroup: 1, kind: "function", opensScope: true },
  ],
  keywords: KEYWORDS,
  isExported: (_name, line) => /\bpublic\b/.test(line),
};
