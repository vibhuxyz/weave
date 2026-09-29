import { createHash } from "node:crypto";
import { MAX_CALLS_PER_MODULE, MAX_FACTS_PER_MODULE } from "../constants.ts";
import type { CallFact, ImportBinding, ImportFact, ModuleFacts, SymbolFact } from "../types.ts";
import { codeLinesOf, type CodeLine } from "./strip.ts";
import type { LanguageSpec } from "./types.ts";

const SYMBOL_HASH_CHARS = 12;
const CALL_PATTERN = /\b([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?)[ \t]*\(/g;
const BINDING_SEPARATOR = /[,\s]+/;

interface Scope {
  readonly name: string;
  readonly level: number;
  entered: boolean;
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

function hashOf(line: string): string {
  return createHash("sha1").update(line.trim()).digest("hex").slice(0, SYMBOL_HASH_CHARS);
}

function bindingsOf(raw: string | undefined): readonly ImportBinding[] {
  if (!raw) return [{ local: "*", imported: "*" }];
  const names = raw
    .split(BINDING_SEPARATOR)
    .map((name) => name.replace(/[{}()]/g, "").trim())
    .filter((name) => name.length > 0 && name !== "as");
  return names.length === 0
    ? [{ local: "*", imported: "*" }]
    : names.map((name) => ({ local: name, imported: name }));
}

function importsOn(line: string, spec: LanguageSpec): ImportFact[] {
  const found: ImportFact[] = [];
  for (const rule of spec.imports) {
    const match = rule.pattern.exec(line);
    const specifier = match?.[rule.specifierGroup]?.trim();
    if (!specifier) continue;
    const raw = rule.bindingsGroup === undefined ? undefined : match?.[rule.bindingsGroup];
    found.push({ specifier, bindings: bindingsOf(raw), isTypeOnly: false });
  }
  return found;
}

function qualify(scopes: readonly Scope[], name: string): string {
  return [...scopes.map((scope) => scope.name), name].join(".");
}

function closeScopes(scopes: Scope[], level: number): void {
  while (scopes.length > 0) {
    const top = scopes.at(-1);
    if (!top || !top.entered || level > top.level) return;
    scopes.pop();
  }
}

function markEntered(scopes: Scope[], depth: number): void {
  for (const scope of scopes) {
    if (depth > scope.level) scope.entered = true;
  }
}

function callsOn(line: string, spec: LanguageSpec, caller: string | null): CallFact[] {
  const found: CallFact[] = [];
  for (const match of line.matchAll(CALL_PATTERN)) {
    const callee = match[1];
    if (!callee || spec.keywords.has(callee)) continue;
    found.push({ callee, caller });
  }
  return found;
}

function levelOf(line: string, spec: LanguageSpec, braceDepth: number): number {
  return spec.scope === "indent" ? indentOf(line) : braceDepth;
}

export function parseWithSpec(path: string, text: string, spec: LanguageSpec): ModuleFacts {
  const lines = codeLinesOf(text, spec.lineComments, spec.blockComments);
  const symbols: SymbolFact[] = [];
  const imports: ImportFact[] = [];
  const calls: CallFact[] = [];
  const scopes: Scope[] = [];
  let braceDepth = 0;

  lines.forEach((entry: CodeLine, index) => {
    const line = entry.code;
    if (line.trim().length === 0) return;
    const level = levelOf(line, spec, braceDepth);
    closeScopes(scopes, level);

    if (imports.length < MAX_FACTS_PER_MODULE) imports.push(...importsOn(entry.text, spec));

    const declared = declarationOn(line, spec);
    if (declared && symbols.length < MAX_FACTS_PER_MODULE) {
      const name = declared.qualifier ? `${declared.qualifier}.${declared.name}` : qualify(scopes, declared.name);
      symbols.push({
        id: `${path}#${name}`,
        name,
        kind: declared.kind,
        file: path,
        line: index + 1,
        isExported: spec.isExported(declared.name, line),
        hash: hashOf(line),
      });
      if (declared.opensScope) scopes.push({ name: declared.name, level, entered: spec.scope === "indent" });
    } else if (calls.length < MAX_CALLS_PER_MODULE) {
      calls.push(...callsOn(line, spec, scopes.length > 0 ? scopes.map((scope) => scope.name).join(".") : null));
    }

    braceDepth += countOf(line, "{") - countOf(line, "}");
    if (spec.scope === "brace") markEntered(scopes, braceDepth);
  });

  return { path, symbols, imports, calls: calls.slice(0, MAX_CALLS_PER_MODULE), instances: [], apis: [], events: [] };
}

function countOf(line: string, char: string): number {
  let total = 0;
  for (const current of line) if (current === char) total += 1;
  return total;
}

interface Declaration {
  readonly name: string;
  readonly qualifier: string | null;
  readonly kind: SymbolFact["kind"];
  readonly opensScope: boolean;
}

function declarationOn(line: string, spec: LanguageSpec): Declaration | null {
  for (const rule of spec.symbols) {
    const match = rule.pattern.exec(line);
    const name = match?.[rule.nameGroup];
    if (!name) continue;
    const qualifier = rule.qualifierGroup === undefined ? null : match?.[rule.qualifierGroup] ?? null;
    return { name, qualifier, kind: rule.kind, opensScope: rule.opensScope };
  }
  return null;
}
