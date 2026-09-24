import { createHash } from "node:crypto";
import ts from "typescript";
import type { SymbolFact, SymbolKind } from "../types.ts";
import { hasExportModifier, lineOf } from "./syntax.ts";

interface Declared {
  readonly name: string;
  readonly kind: SymbolKind;
  readonly node: ts.Node;
  readonly isExported: boolean;
}

function isFunctionLike(node: ts.Expression | undefined): boolean {
  return node !== undefined && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));
}

function classMembers(node: ts.ClassDeclaration, className: string, isExported: boolean): readonly Declared[] {
  return node.members.flatMap((member) =>
    (ts.isMethodDeclaration(member) || ts.isPropertyDeclaration(member)) && member.name && ts.isIdentifier(member.name) && (ts.isMethodDeclaration(member) || isFunctionLike(member.initializer))
      ? [{ name: `${className}.${member.name.text}`, kind: "function" as const, node: member, isExported }]
      : [],
  );
}

function declaredBy(statement: ts.Statement): readonly Declared[] {
  const isExported = hasExportModifier(statement);
  if (ts.isFunctionDeclaration(statement) && statement.name) return [{ name: statement.name.text, kind: "function", node: statement, isExported }];
  if (ts.isClassDeclaration(statement) && statement.name) {
    return [{ name: statement.name.text, kind: "class", node: statement, isExported }, ...classMembers(statement, statement.name.text, isExported)];
  }
  if (ts.isInterfaceDeclaration(statement)) return [{ name: statement.name.text, kind: "interface", node: statement, isExported }];
  if (ts.isTypeAliasDeclaration(statement)) return [{ name: statement.name.text, kind: "type", node: statement, isExported }];
  if (ts.isEnumDeclaration(statement)) return [{ name: statement.name.text, kind: "enum", node: statement, isExported }];
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.flatMap((declaration) =>
      ts.isIdentifier(declaration.name)
        ? [{ name: declaration.name.text, kind: isFunctionLike(declaration.initializer) ? ("function" as const) : ("variable" as const), node: declaration, isExported }]
        : [],
    );
  }
  return [];
}

function namedExports(source: ts.SourceFile): ReadonlySet<string> {
  const names = source.statements.flatMap((statement) => {
    if (ts.isExportDeclaration(statement) && !statement.moduleSpecifier && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      return statement.exportClause.elements.map((element) => (element.propertyName ?? element.name).text);
    }
    if (ts.isExportAssignment(statement) && ts.isIdentifier(statement.expression)) return [statement.expression.text];
    return [];
  });
  return new Set(names);
}

const SYMBOL_HASH_CHARS = 12;

function hashOf(source: ts.SourceFile, node: ts.Node): string {
  return createHash("sha1").update(source.text.slice(node.getStart(source), node.end)).digest("hex").slice(0, SYMBOL_HASH_CHARS);
}

export function collectSymbols(source: ts.SourceFile, path: string): readonly SymbolFact[] {
  const exported = namedExports(source);
  return source.statements.flatMap(declaredBy).map((declared) => ({
    id: `${path}#${declared.name}`,
    name: declared.name,
    kind: declared.kind,
    file: path,
    line: lineOf(source, declared.node),
    isExported: declared.isExported || exported.has(declared.name.split(".")[0] ?? declared.name),
    hash: hashOf(source, declared.node),
  }));
}
