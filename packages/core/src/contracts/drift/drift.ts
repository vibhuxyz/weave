import { CONTRACT_DIR } from "../constants.ts";

export interface SourceFile {
  readonly path: string;
  readonly content: string;
}

export interface DriftFinding {
  readonly path: string;
  readonly symbols: readonly string[];
}

const MAX_LISTED_FINDINGS = 5;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function declarationPattern(symbol: string): RegExp {
  const name = escapeRegExp(symbol);
  return new RegExp(`\\b(?:const|let|var|function|class|interface|type|enum)\\s+${name}\\b|@typedef\\s*\\{[^}]*\\}\\s*${name}\\b`);
}

export function findRedeclaredSymbols(files: readonly SourceFile[], exports: readonly string[]): readonly DriftFinding[] {
  const patterns = exports.map((symbol) => ({ symbol, pattern: declarationPattern(symbol) }));
  return files
    .filter((file) => !file.path.startsWith(`${CONTRACT_DIR}/`))
    .map((file) => ({ path: file.path, symbols: patterns.filter(({ pattern }) => pattern.test(file.content)).map(({ symbol }) => symbol) }))
    .filter((finding) => finding.symbols.length > 0);
}

export function describeDrift(findings: readonly DriftFinding[], entryPath: string): string {
  const listed = findings.slice(0, MAX_LISTED_FINDINGS).map((finding) => `${finding.path} (${finding.symbols.join(", ")})`).join("; ");
  const more = findings.length > MAX_LISTED_FINDINGS ? ` (+${findings.length - MAX_LISTED_FINDINGS} more files)` : "";
  return `re-declares contract symbols locally: ${listed}${more}. Import them from ${entryPath}, or request a contract change`;
}
