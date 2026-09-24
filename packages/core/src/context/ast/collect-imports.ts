import ts from "typescript";
import type { ImportBinding, ImportFact } from "../types.ts";
import { stringLiteralOf } from "./syntax.ts";

function importBindings(clause: ts.ImportClause | undefined): readonly ImportBinding[] {
  if (!clause) return [];
  const defaultBinding = clause.name ? [{ local: clause.name.text, imported: "default" }] : [];
  const named = clause.namedBindings;
  if (!named) return defaultBinding;
  if (ts.isNamespaceImport(named)) return [...defaultBinding, { local: named.name.text, imported: "*" }];
  return [...defaultBinding, ...named.elements.map((element) => ({ local: element.name.text, imported: (element.propertyName ?? element.name).text }))];
}

function fromStatement(statement: ts.Statement): ImportFact | null {
  if (ts.isImportDeclaration(statement)) {
    const specifier = stringLiteralOf(statement.moduleSpecifier);
    return specifier ? { specifier, bindings: importBindings(statement.importClause), isTypeOnly: statement.importClause?.isTypeOnly ?? false } : null;
  }
  if (ts.isExportDeclaration(statement) && statement.moduleSpecifier) {
    const specifier = stringLiteralOf(statement.moduleSpecifier);
    const clause = statement.exportClause;
    const bindings = clause && ts.isNamedExports(clause) ? clause.elements.map((element) => ({ local: element.name.text, imported: (element.propertyName ?? element.name).text })) : [{ local: "*", imported: "*" }];
    return specifier ? { specifier, bindings, isTypeOnly: statement.isTypeOnly } : null;
  }
  return null;
}

function dynamicSpecifier(node: ts.Node): string | null {
  if (!ts.isCallExpression(node)) return null;
  const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
  const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
  return isDynamicImport || isRequire ? stringLiteralOf(node.arguments[0]) : null;
}

export function collectImports(source: ts.SourceFile, dynamicCalls: readonly ts.CallExpression[]): readonly ImportFact[] {
  const declared = source.statements.flatMap((statement) => fromStatement(statement) ?? []);
  const dynamic = dynamicCalls.flatMap((call) => {
    const specifier = dynamicSpecifier(call);
    return specifier ? [{ specifier, bindings: [{ local: "*", imported: "*" }], isTypeOnly: false }] : [];
  });
  return [...declared, ...dynamic];
}
