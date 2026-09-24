export type TaskKind = "web" | "api" | "db";

export interface EngineTruth {
  readonly id: string;
  readonly successByKind: Readonly<Record<TaskKind, number>>;
  readonly speedFactor: number;
  readonly costUsdPerUnit: number;
}

export interface SimTask {
  readonly id: string;
  readonly kind: TaskKind;
  readonly sizeUnits: number;
  readonly dependsOn: readonly string[];
  readonly directory: string;
}

export type ScenarioShape = "pair" | "fan" | "chain" | "overlap" | "diamond";

export interface Scenario {
  readonly id: string;
  readonly shape: ScenarioShape;
  readonly tasks: readonly SimTask[];
}

export interface World {
  readonly engines: readonly EngineTruth[];
  readonly msPerUnit: number;
  readonly seed: string;
}
