import type { SymbolFact } from "../types.ts";
import type { RankedSymbol } from "./types.ts";

const IDENTIFIER = /[A-Za-z_][A-Za-z0-9_]*/g;
const MIN_IDENTIFIER_CHARS = 4;
const MAX_NAMED_SYMBOLS = 20;

function isIdentifier(token: string): boolean {
  return token.length >= MIN_IDENTIFIER_CHARS && (/[A-Z]/.test(token) || token.includes("_"));
}

function keysOf(name: string): readonly string[] {
  return [name, ...name.split(/[.#]/)];
}

export function namedSymbols(symbols: readonly SymbolFact[], request: string): readonly RankedSymbol[] {
  const tokens = new Set([...request.matchAll(IDENTIFIER)].map((match) => match[0] ?? "").filter(isIdentifier));
  if (tokens.size === 0) return [];
  const hits: RankedSymbol[] = [];
  const seen = new Set<string>();
  const ordered = [...symbols].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.name.localeCompare(b.name));
  for (const symbol of ordered) {
    const matched = [...new Set(keysOf(symbol.name).filter((key) => tokens.has(key)))].sort();
    if (matched.length === 0 || seen.has(symbol.id)) continue;
    seen.add(symbol.id);
    hits.push({ symbol, matchedTerms: matched });
    if (hits.length >= MAX_NAMED_SYMBOLS) break;
  }
  return hits;
}
