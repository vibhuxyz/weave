import type { MutableRefObject } from "react";
import * as THREE from "three";
import type { ProjectArtifactState } from "../types";
import { SCENE_ANIM } from "./constants";

export interface CameraAngles {
  azimuth: number;
  polar: number;
}

export interface ArtifactRuntimeState {
  clickPulse: number;
  contentTransition: number;
  cursorPosition: { x: number; y: number };
  dragVelocity: number;
  imageIndex: number;
  isDragging: boolean;
  isHovered: boolean;
  isIdle: boolean;
  isPointerDown: boolean;
  isTransitioning: boolean;
  lastInteractionTime: number;
}

export type ArtifactRuntimeRef = MutableRefObject<ArtifactRuntimeState>;
export type CameraAnglesRef = MutableRefObject<CameraAngles>;
export type TextureList = THREE.Texture[];

export interface ImageCycle {
  currentIndex: number;
  fadeProgress: number;
  isFading: boolean;
  lastCycleTime: number;
  nextCycleVariance: number;
  nextIndex: number;
  transitionEndTime: number;
}

export function makeRuntime(initialImageIndex: number): ArtifactRuntimeState {
  return {
    clickPulse: 0,
    contentTransition: 1,
    cursorPosition: { x: 0, y: 0 },
    dragVelocity: 0,
    imageIndex: initialImageIndex,
    isDragging: false,
    isHovered: false,
    isIdle: false,
    isPointerDown: false,
    isTransitioning: false,
    lastInteractionTime: Date.now(),
  };
}

export function makeImageCycle(
  initialIndex: number,
  textureCount: number,
): ImageCycle {
  const normalizedIndex = wrapIndex(initialIndex, textureCount);
  return {
    currentIndex: normalizedIndex,
    fadeProgress: 0,
    isFading: false,
    lastCycleTime: 0,
    nextCycleVariance: (Math.random() - 0.5) * 10,
    nextIndex: wrapIndex(normalizedIndex + 1, textureCount),
    transitionEndTime: 0,
  };
}

export function wrapIndex(index: number, length: number) {
  if (length <= 0) return 0;
  return ((index % length) + length) % length;
}

export function initialImageIndexForState(
  state: ProjectArtifactState,
  imageCount: number,
  variant: "preview" | "tile",
) {
  if (variant === "tile") return 0;
  return wrapIndex(state.seed, imageCount);
}

export function triggerNextImage(cycle: ImageCycle, textureCount: number) {
  if (cycle.isFading) return;
  cycle.nextIndex = wrapIndex(cycle.currentIndex + 1, textureCount);
  cycle.fadeProgress = 0;
  cycle.isFading = true;
}

export function advanceImageCycle({
  cycle,
  delta,
  fadeDuration,
  runtime,
  textureCount,
  time,
  totalDuration = fadeDuration,
}: {
  cycle: ImageCycle;
  delta: number;
  fadeDuration: number;
  runtime: ArtifactRuntimeState;
  textureCount: number;
  time: number;
  totalDuration?: number;
}) {
  if (textureCount <= 0) return;
  if (runtime.isTransitioning) cycle.transitionEndTime = time;
  const blocked =
    runtime.isTransitioning || time - cycle.transitionEndTime < 2.0;

  const cycleDuration = SCENE_ANIM.imageCycleDuration + cycle.nextCycleVariance;
  if (
    !blocked &&
    !cycle.isFading &&
    time - cycle.lastCycleTime > cycleDuration
  ) {
    cycle.lastCycleTime = time;
    cycle.nextCycleVariance = (Math.random() - 0.5) * 10;
    triggerNextImage(cycle, textureCount);
  }

  if (cycle.isFading) {
    cycle.fadeProgress += delta / totalDuration;
    if (cycle.fadeProgress >= 1) {
      cycle.fadeProgress = 0;
      cycle.isFading = false;
      cycle.currentIndex = cycle.nextIndex;
      runtime.imageIndex = cycle.currentIndex;
      cycle.nextIndex = wrapIndex(cycle.currentIndex + 1, textureCount);
    }
  }
}

export function smoothstep(value: number) {
  return value * value * (3 - 2 * value);
}

export function clamp01(value: number) {
  return THREE.MathUtils.clamp(value, 0, 1);
}

export function clickEnvelope(elapsed: number, duration: number) {
  if (elapsed < 0 || elapsed > duration) return 0;
  const t = clamp01(elapsed / duration);
  const eased = Math.sin(t * Math.PI);
  return eased * eased;
}

export function recordInteraction(runtimeRef: ArtifactRuntimeRef) {
  runtimeRef.current.lastInteractionTime = Date.now();
  runtimeRef.current.isIdle = false;
}

export function wave01(time: number, f1: number, f2: number, offset = 0) {
  return (
    (Math.sin(time * f1 + offset) * 0.6 +
      Math.sin(time * f2 + offset * 1.3) * 0.4) *
      0.5 +
    0.5
  );
}

export function animatedMaterialValue(
  prop: { min: number; max: number; speed: number },
  time: number,
  f1: number,
  f2: number,
  offset = 0,
) {
  if (prop.speed === 0) return prop.min;
  const t = wave01(time, f1 * prop.speed, f2 * prop.speed, offset);
  return prop.min + (prop.max - prop.min) * t;
}

export function textureAt(textures: TextureList, index: number): THREE.Texture {
  const wrapped = wrapIndex(index, textures.length);
  const texture = textures[wrapped];
  if (!texture) {
    throw new Error(
      `textureAt: no texture at wrapped index ${wrapped} of ${textures.length}`,
    );
  }
  return texture;
}
