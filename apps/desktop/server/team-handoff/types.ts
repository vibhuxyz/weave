import type { PlannedTask } from "@weave/core";
import type { PromptImageData } from "../shared/index.ts";

export interface TeamRunStart {
  readonly request: string;
  readonly routeReason: string;
  readonly plannerNotes: string;
  readonly presetTasks: readonly PlannedTask[];
  readonly briefings: ReadonlyMap<string, string>;
  readonly images?: readonly PromptImageData[];
}

export interface TurnWatch {
  readonly read: () => string;
  readonly close: () => void;
  readonly whenClosed: (listener: () => void) => void;
}
