import ts from "typescript";

export interface VisitedCall {
  readonly node: ts.CallExpression;
  readonly caller: string | null;
}

export interface WalkResult {
  readonly calls: readonly VisitedCall[];
  readonly objects: readonly { readonly node: ts.ObjectLiteralExpression; readonly owner: string | null }[];
}

function ownerName(node: ts.Node, current: string | null, className: string | null): string | null {
  if (ts.isFunctionDeclaration(node) && node.name) return node.name.text;
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && current === null) return node.name.text;
  if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name) && className) return `${className}.${node.name.text}`;
  if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && current !== null) return current;
  return current;
}

export function walkModule(source: ts.SourceFile): WalkResult {
  const calls: VisitedCall[] = [];
  const objects: { node: ts.ObjectLiteralExpression; owner: string | null }[] = [];
  const visit = (node: ts.Node, current: string | null, className: string | null): void => {
    const nextClass = ts.isClassDeclaration(node) && node.name ? node.name.text : className;
    const owner = ts.isClassDeclaration(node) && node.name ? node.name.text : ownerName(node, current, nextClass);
    if (ts.isCallExpression(node)) calls.push({ node, caller: owner });
    if (ts.isObjectLiteralExpression(node)) objects.push({ node, owner });
    ts.forEachChild(node, (child) => visit(child, owner, nextClass));
  };
  ts.forEachChild(source, (child) => visit(child, null, null));
  return { calls, objects };
}
