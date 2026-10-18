export interface AwakeHold {
  readonly release: () => void;
}

export type HoldAwake = (onProblem: (message: string) => void) => AwakeHold;
