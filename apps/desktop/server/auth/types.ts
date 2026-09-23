import type { EngineAuthOperation } from "@weave/protocol";

export interface ActiveAuthSession {
  readonly abort: AbortController;
  operation: EngineAuthOperation;
  submitInput: ((text: string) => void) | null;
}
