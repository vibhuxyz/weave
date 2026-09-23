export const FIELD_COLOR_TOKENS: readonly string[] = [
  "--color-splash-pink",
  "--color-orange-200",
  "--color-splash-amber",
  "--color-splash-sky",
  "--color-splash-indigo",
  "--color-blue-400",
  "--color-splash-violet",
  "--color-splash-fuchsia",
] as const;

export const MAX_FIELD_PARTICLES = 2400;
export const INNER_RADIUS_PX = 90;
export const RING_GAP_PX = 30;
export const ARC_SPACING_PX = 40;
export const EDGE_MARGIN_PX = 60;
export const INNER_FADE_PX = 150;
export const OUTER_FADE_START = 0.55;
export const MAX_PARTICLE_ALPHA = 0.8;
export const BASE_PARTICLE_ALPHA = 0.1;

export const ALPHA_LEVELS = 4;
export const MIN_VISIBLE_ALPHA = 0.06;
export const DASH_MIN_LENGTH_PX = 1.5;
export const DASH_LENGTH_RANGE_PX = 3.5;
export const DASH_WIDTH_PX = 1.5;
export const DASH_TWIST_RADIANS = 0.35;

export const WAVE_SPEED = 1.4;
export const WAVE_FREQUENCY = 0.018;
export const BREATH_AMOUNT = 0.03;
export const BREATH_SPEED = 0.7;
export const BREATH_RING_OFFSET = 0.3;
export const WOBBLE_PX = 5;
export const SPIN_RADIANS_PER_SECOND = 0.035;
export const COLOR_JITTER = 0.08;

export const FADE_IN_SECONDS = 1.4;
export const STILL_FRAME_SECONDS = 12;
export const CENTER_Y_RATIO = 0.5;

export interface WanderWave {
  readonly speed: number;
  readonly phase: number;
  readonly reach: number;
}

export const WANDER_X_WAVES: readonly WanderWave[] = [
  { speed: 0.21, phase: 0, reach: 0.11 },
  { speed: 0.53, phase: 1.7, reach: 0.045 },
  { speed: 0.97, phase: 4.1, reach: 0.018 },
] as const;

export const WANDER_Y_WAVES: readonly WanderWave[] = [
  { speed: 0.17, phase: 2.3, reach: 0.09 },
  { speed: 0.61, phase: 0.6, reach: 0.04 },
  { speed: 1.13, phase: 3.4, reach: 0.015 },
] as const;
