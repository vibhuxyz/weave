import type { LanguageSpec } from "../types.ts";

const KEYWORDS = new Set([
  "if", "for", "switch", "return", "func", "go", "defer", "make", "new", "len", "cap", "append",
  "panic", "recover", "range", "select", "type", "var", "const", "struct", "interface", "map",
]);

export const GO: LanguageSpec = {
  language: "go",
  extensions: [".go"],
  lineComments: ["//"],
  blockComments: [["/*", "*/"]],
  scope: "brace",
  imports: [
    { pattern: /^[ \t]*import[ \t]+(?:[\w.]+[ \t]+)?"([^"]+)"/, specifierGroup: 1 },
    { pattern: /^[ \t]+(?:[\w.]+[ \t]+)?"([^"]+)"[ \t]*$/, specifierGroup: 1 },
  ],
  symbols: [
    { pattern: /^func[ \t]+\([ \t]*(?:[A-Za-z_]\w*[ \t]+)?\*?([A-Za-z_]\w*)[ \t]*\)[ \t]*([A-Za-z_]\w*)/, nameGroup: 2, qualifierGroup: 1, kind: "function", opensScope: true },
    { pattern: /^func[ \t]+([A-Za-z_]\w*)/, nameGroup: 1, kind: "function", opensScope: true },
    { pattern: /^type[ \t]+([A-Za-z_]\w*)[ \t]+struct/, nameGroup: 1, kind: "class", opensScope: false },
    { pattern: /^type[ \t]+([A-Za-z_]\w*)[ \t]+interface/, nameGroup: 1, kind: "interface", opensScope: false },
    { pattern: /^type[ \t]+([A-Za-z_]\w*)/, nameGroup: 1, kind: "type", opensScope: false },
    { pattern: /^(?:var|const)[ \t]+([A-Za-z_]\w*)/, nameGroup: 1, kind: "variable", opensScope: false },
  ],
  keywords: KEYWORDS,
  isExported: (name) => /^[A-Z]/.test(name),
};
