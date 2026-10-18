export interface AwakeClock {
  readonly awakeMs: number;
  readonly lastTickMs: number;
}

export interface AwakeTimeout {
  readonly clear: () => void;
  readonly unref: () => void;
}

export interface AwakeTimeoutOptions {
  readonly now?: () => number;
}
