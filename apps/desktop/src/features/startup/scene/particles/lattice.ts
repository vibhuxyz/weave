import { ARC_SPACING_PX, INNER_RADIUS_PX, MAX_FIELD_PARTICLES, RING_GAP_PX } from "./constants";

export interface FieldParticle {
  readonly ring: number;
  readonly baseAngle: number;
  readonly seed: number;
}

export interface FieldLattice {
  readonly particles: readonly FieldParticle[];
  readonly maxRadiusPx: number;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const TAU = Math.PI * 2;
const MIN_PER_RING = 6;
const ANGLE_JITTER = 0.12;

function pseudoRandom(index: number): number {
  const value = Math.sin(index * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function ringRadii(maxRadiusPx: number): number[] {
  const ringCount = Math.max(0, Math.floor((maxRadiusPx - INNER_RADIUS_PX) / RING_GAP_PX));
  return Array.from({ length: ringCount + 1 }, (_, ring) => INNER_RADIUS_PX + ring * RING_GAP_PX);
}

function spacingToFit(radii: readonly number[]): number {
  const circumference = radii.reduce((total, radius) => total + TAU * radius, 0);
  const naturalCount = circumference / ARC_SPACING_PX;
  return naturalCount > MAX_FIELD_PARTICLES ? circumference / MAX_FIELD_PARTICLES : ARC_SPACING_PX;
}

export function buildLattice(maxRadiusPx: number): FieldLattice {
  const radii = ringRadii(maxRadiusPx);
  const spacingPx = spacingToFit(radii);
  const particles: FieldParticle[] = [];

  radii.forEach((radius, ring) => {
    const count = Math.max(MIN_PER_RING, Math.floor((TAU * radius) / spacingPx));
    for (let slot = 0; slot < count && particles.length < MAX_FIELD_PARTICLES; slot += 1) {
      const seed = pseudoRandom(particles.length + 1);
      particles.push({
        ring,
        baseAngle: ring * GOLDEN_ANGLE + (slot / count) * TAU + seed * ANGLE_JITTER,
        seed: seed * TAU,
      });
    }
  });

  return { particles, maxRadiusPx };
}
