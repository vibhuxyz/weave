import type { LanguageSpec } from "../types.ts";

const KEYWORDS = new Set([
  "if", "for", "while", "switch", "return", "sizeof", "new", "delete", "catch", "try", "throw",
  "struct", "class", "enum", "union", "namespace", "template", "typename", "static_cast", "defined",
]);

export const C_FAMILY: LanguageSpec = {
  language: "c",
  extensions: [".c", ".h", ".cpp", ".cc", ".cxx", ".hpp", ".hh"],
  lineComments: ["//"],
  blockComments: [["/*", "*/"]],
  scope: "brace",
  imports: [{ pattern: /^[ \t]*#[ \t]*include[ \t]*[<"]([^>"]+)[>"]/, specifierGroup: 1 }],
  symbols: [
    { pattern: /^[ \t]*(?:template[ \t]*<[^>]*>[ \t]*)?class[ \t]+([A-Za-z_]\w*)/, nameGroup: 1, kind: "class", opensScope: true },
    { pattern: /^[ \t]*struct[ \t]+([A-Za-z_]\w*)/, nameGroup: 1, kind: "class", opensScope: true },
    { pattern: /^[ \t]*enum(?:[ \t]+class)?[ \t]+([A-Za-z_]\w*)/, nameGroup: 1, kind: "enum", opensScope: false },
    { pattern: /^[ \t]*typedef[ \t]+.+[ \t]+([A-Za-z_]\w*)[ \t]*;/, nameGroup: 1, kind: "type", opensScope: false },
    { pattern: /^[A-Za-z_][\w:<>,* \t]*[ \t*&]([A-Za-z_]\w*)[ \t]*\([^;]*$/, nameGroup: 1, kind: "function", opensScope: true },
  ],
  keywords: KEYWORDS,
  isExported: (_name, line) => !/\bstatic\b/.test(line),
};
