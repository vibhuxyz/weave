import { CENTER_Y_RATIO, WANDER_X_WAVES, WANDER_Y_WAVES, type WanderWave } from "./constants";

export interface FieldCenter {
  readonly x: number;
  readonly y: number;
}

function sumWaves(waves: readonly WanderWave[], timeSeconds: number): number {
  return waves.reduce((total, wave) => total + Math.sin(timeSeconds * wave.speed + wave.phase) * wave.reach, 0);
}

export function wanderCenter(timeSeconds: number, widthPx: number, heightPx: number): FieldCenter {
  return {
    x: widthPx * (0.5 + sumWaves(WANDER_X_WAVES, timeSeconds)),
    y: heightPx * (CENTER_Y_RATIO + sumWaves(WANDER_Y_WAVES, timeSeconds)),
  };
}
