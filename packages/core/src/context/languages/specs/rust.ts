import type { LanguageSpec } from "../types.ts";

const KEYWORDS = new Set([
  "if", "for", "while", "match", "return", "fn", "let", "mut", "impl", "struct", "enum", "trait",
  "use", "mod", "pub", "self", "super", "crate", "move", "loop", "where", "as", "dyn", "Some", "Ok", "Err",
]);

export const RUST: LanguageSpec = {
  language: "rust",
  extensions: [".rs"],
  lineComments: ["//"],
  blockComments: [["/*", "*/"]],
  scope: "brace",
  imports: [{ pattern: /^[ \t]*(?:pub[ \t]+)?use[ \t]+([A-Za-z_][\w:]*)/, specifierGroup: 1 }],
  symbols: [
    { pattern: /^[ \t]*(?:pub(?:\([^)]*\))?[ \t]+)?(?:async[ \t]+)?fn[ \t]+([A-Za-z_]\w*)/, nameGroup: 1, kind: "function", opensScope: true },
    { pattern: /^[ \t]*(?:pub(?:\([^)]*\))?[ \t]+)?struct[ \t]+([A-Za-z_]\w*)/, nameGroup: 1, kind: "class", opensScope: false },
    { pattern: /^[ \t]*(?:pub(?:\([^)]*\))?[ \t]+)?trait[ \t]+([A-Za-z_]\w*)/, nameGroup: 1, kind: "interface", opensScope: false },
    { pattern: /^[ \t]*(?:pub(?:\([^)]*\))?[ \t]+)?enum[ \t]+([A-Za-z_]\w*)/, nameGroup: 1, kind: "enum", opensScope: false },
    { pattern: /^[ \t]*(?:pub(?:\([^)]*\))?[ \t]+)?type[ \t]+([A-Za-z_]\w*)/, nameGroup: 1, kind: "type", opensScope: false },
    { pattern: /^[ \t]*(?:pub(?:\([^)]*\))?[ \t]+)?(?:static|const)[ \t]+([A-Za-z_]\w*)/, nameGroup: 1, kind: "variable", opensScope: false },
  ],
  keywords: KEYWORDS,
  isExported: (_name, line) => /\bpub\b/.test(line),
};
