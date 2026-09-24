import ts from "typescript";
import type { ModuleFacts } from "../types.ts";
import { collectApis, collectEvents } from "./collect-apis.ts";
import { collectCalls, collectInstances } from "./collect-calls.ts";
import { collectImports } from "./collect-imports.ts";
import { collectSymbols } from "./collect-symbols.ts";
import { scriptKindOf } from "./syntax.ts";
import { walkModule } from "./walk.ts";

export function parseModule(path: string, text: string): ModuleFacts {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, scriptKindOf(path));
  const walked = walkModule(source);
  const symbols = collectSymbols(source, path);
  return {
    path,
    symbols,
    imports: collectImports(source, walked.calls.map((call) => call.node)),
    calls: collectCalls(walked.calls),
    instances: collectInstances(source),
    apis: collectApis(source, path, walked, symbols),
    events: collectEvents(source, path, walked),
  };
}
