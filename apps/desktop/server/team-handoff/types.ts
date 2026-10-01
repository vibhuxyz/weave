import type { PromptImageData } from "../shared/index.ts";

export interface TeamRunStart {
  readonly request: string;
  readonly routeReason: string;
  readonly plannerNotes: string;
  readonly images?: readonly PromptImageData[];
}

export interface TurnWatch {
  readonly read: () => string;
  readonly close: () => void;
}
