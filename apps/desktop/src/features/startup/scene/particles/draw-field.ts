import {
  ALPHA_LEVELS,
  BASE_PARTICLE_ALPHA,
  BREATH_AMOUNT,
  BREATH_RING_OFFSET,
  BREATH_SPEED,
  COLOR_JITTER,
  DASH_LENGTH_RANGE_PX,
  DASH_MIN_LENGTH_PX,
  DASH_TWIST_RADIANS,
  DASH_WIDTH_PX,
  FADE_IN_SECONDS,
  INNER_FADE_PX,
  INNER_RADIUS_PX,
  MAX_PARTICLE_ALPHA,
  MIN_VISIBLE_ALPHA,
  OUTER_FADE_START,
  RING_GAP_PX,
  SPIN_RADIANS_PER_SECOND,
  WAVE_FREQUENCY,
  WAVE_SPEED,
  WOBBLE_PX,
} from "./constants";
import type { FieldLattice, FieldParticle } from "./lattice";

const TAU = Math.PI * 2;

export interface FieldFrame {
  readonly timeSeconds: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly colors: readonly string[];
}

function smoothstep(edgeStart: number, edgeEnd: number, value: number): number {
  const amount = Math.min(1, Math.max(0, (value - edgeStart) / (edgeEnd - edgeStart)));
  return amount * amount * (3 - 2 * amount);
}

function particleAlpha(radius: number, wave: number, maxRadius: number): number {
  const innerFade = smoothstep(INNER_RADIUS_PX, INNER_RADIUS_PX + INNER_FADE_PX, radius);
  const outerFade = 1 - smoothstep(maxRadius * OUTER_FADE_START, maxRadius, radius);
  return innerFade * outerFade * (BASE_PARTICLE_ALPHA + (MAX_PARTICLE_ALPHA - BASE_PARTICLE_ALPHA) * wave);
}

function colorIndexFor(angle: number, seed: number, colorCount: number): number {
  const turn = (((angle / TAU + (seed / TAU) * COLOR_JITTER) % 1) + 1) % 1;
  return Math.floor(turn * colorCount) % colorCount;
}

function traceParticle(paths: readonly Path2D[], particle: FieldParticle, lattice: FieldLattice, frame: FieldFrame): void {
  const t = frame.timeSeconds;
  const ringRadius = INNER_RADIUS_PX + particle.ring * RING_GAP_PX;
  const wave = 0.5 + 0.5 * Math.sin(t * WAVE_SPEED - ringRadius * WAVE_FREQUENCY + particle.seed);
  const breath = 1 + BREATH_AMOUNT * Math.sin(t * BREATH_SPEED - particle.ring * BREATH_RING_OFFSET);
  const radius = ringRadius * breath + (wave - 0.5) * WOBBLE_PX;
  const direction = particle.ring % 2 === 0 ? 1 : -1;
  const angle = particle.baseAngle + t * SPIN_RADIANS_PER_SECOND * direction;
  const x = frame.centerX + Math.cos(angle) * radius;
  const y = frame.centerY + Math.sin(angle) * radius;
  if (x < -10 || y < -10 || x > frame.widthPx + 10 || y > frame.heightPx + 10) return;

  const fadeIn = Math.min(1, t / FADE_IN_SECONDS);
  const alpha = particleAlpha(radius, wave, lattice.maxRadiusPx) * fadeIn;
  if (alpha < MIN_VISIBLE_ALPHA) return;

  const alphaLevel = Math.min(ALPHA_LEVELS - 1, Math.floor(alpha * ALPHA_LEVELS));
  const colorIndex = colorIndexFor(angle, particle.seed, frame.colors.length);
  const path = paths[colorIndex * ALPHA_LEVELS + alphaLevel];
  if (!path) return;

  const halfLength = (DASH_MIN_LENGTH_PX + wave * DASH_LENGTH_RANGE_PX) / 2;
  const dashAngle = angle + DASH_TWIST_RADIANS;
  const dx = Math.cos(dashAngle) * halfLength;
  const dy = Math.sin(dashAngle) * halfLength;
  path.moveTo(x - dx, y - dy);
  path.lineTo(x + dx, y + dy);
}

export function drawField(context: CanvasRenderingContext2D, lattice: FieldLattice, frame: FieldFrame): void {
  context.clearRect(0, 0, frame.widthPx, frame.heightPx);
  if (frame.colors.length === 0) return;

  const paths = Array.from({ length: frame.colors.length * ALPHA_LEVELS }, () => new Path2D());
  for (const particle of lattice.particles) traceParticle(paths, particle, lattice, frame);

  context.lineCap = "round";
  context.lineWidth = DASH_WIDTH_PX;
  paths.forEach((path, bucket) => {
    const color = frame.colors[Math.floor(bucket / ALPHA_LEVELS)];
    if (!color) return;
    context.globalAlpha = ((bucket % ALPHA_LEVELS) + 1) / ALPHA_LEVELS;
    context.strokeStyle = color;
    context.stroke(path);
  });
  context.globalAlpha = 1;
}
