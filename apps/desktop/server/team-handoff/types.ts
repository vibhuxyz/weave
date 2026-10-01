export interface TeamRunStart {
  readonly request: string;
  readonly routeReason: string;
  readonly plannerNotes: string;
}

export interface TurnWatch {
  readonly read: () => string;
  readonly close: () => void;
}
