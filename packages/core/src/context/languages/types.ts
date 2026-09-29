import type { ModuleFacts, SymbolKind } from "../types.ts";

export type ScopeStyle = "indent" | "brace";

export interface ImportRule {
  readonly pattern: RegExp;
  readonly specifierGroup: number;
  readonly bindingsGroup?: number;
}

export interface SymbolRule {
  readonly pattern: RegExp;
  readonly nameGroup: number;
  readonly qualifierGroup?: number;
  readonly kind: SymbolKind;
  readonly opensScope: boolean;
}

export interface LanguageSpec {
  readonly language: string;
  readonly extensions: readonly string[];
  readonly lineComments: readonly string[];
  readonly blockComments: readonly (readonly [string, string])[];
  readonly scope: ScopeStyle;
  readonly imports: readonly ImportRule[];
  readonly symbols: readonly SymbolRule[];
  readonly keywords: ReadonlySet<string>;
  readonly isExported: (name: string, line: string) => boolean;
}

export interface LanguageAdapter {
  readonly language: string;
  readonly extensions: readonly string[];
  readonly parse: (path: string, text: string) => ModuleFacts;
}
