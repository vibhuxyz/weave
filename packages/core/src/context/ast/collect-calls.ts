import type { CallFact } from "../types.ts";
import { MAX_CALLS_PER_MODULE } from "../constants.ts";
import { calleeName } from "./syntax.ts";
import type { VisitedCall } from "./walk.ts";

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
