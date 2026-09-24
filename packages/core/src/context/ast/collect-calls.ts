import ts from "typescript";
import type { CallFact, InstanceFact } from "../types.ts";
import { MAX_CALLS_PER_MODULE } from "../constants.ts";
import { calleeName } from "./syntax.ts";
import type { VisitedCall } from "./walk.ts";

export function collectInstances(source: ts.SourceFile): readonly InstanceFact[] {
  const found = new Map<string, string>();
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isNewExpression(node.initializer) && ts.isIdentifier(node.initializer.expression)) {
      if (!found.has(node.name.text)) found.set(node.name.text, node.initializer.expression.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...found].map(([local, className]) => ({ local, className }));
}

export function collectCalls(calls: readonly VisitedCall[]): readonly CallFact[] {
  const seen = new Map<string, CallFact>();
  for (const call of calls) {
    if (seen.size >= MAX_CALLS_PER_MODULE) break;
    const callee = calleeName(call.node.expression);
    if (!callee) continue;
    const key = `${call.caller ?? ""}>${callee}`;
    if (!seen.has(key)) seen.set(key, { callee, caller: call.caller });
  }
  return [...seen.values()];
}
