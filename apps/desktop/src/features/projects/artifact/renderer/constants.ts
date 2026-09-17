import * as THREE from "three";
import type { ProjectArtifactRendererProps } from "../types";

export const CUBE_UNIFORM_SIZE = 5;
export const IDLE_THRESHOLD_MS = 30_000;
export const SLEEP_THRESHOLD_MS = 300_000;
export const CUBE_POINTER_CLICK_PX = 10;
export const CUBE_POINTER_CLICK_MS = 500;
export const CLICK_VISUAL_DURATION = 1.1;
export const VISUAL_READY_FRAME_DELAY = 2;
export const TILE_VISUAL_READY_FRAME_DELAY = 3;

export const MATERIAL_ANIM = {
  roughness: { min: 0.02, max: 0.075, speed: 2.2 },
  thickness: { min: 0.3, max: 0.6, speed: 0.4 },
  chromaticAberration: { min: 0, max: 0.03, speed: 1 },
  distortion: { min: 0, max: 0, speed: 1 },
  distortionScale: { min: 0.05, max: 0.4, speed: 1 },
  anisotropy: { min: 0, max: 0.3, speed: 1 },
  iridescence: { min: 0, max: 0, speed: 1 },
  iridescenceIOR: { min: 1, max: 1, speed: 1 },
};

export const SCENE_ANIM = {
  baseTiltAmplitude: 1,
  baseTiltSpeed: 1,
  breathingAmplitude: 0.4,
  breathingSpeed: 0.3,
  clickPulseStrength: 1,
  contentMicroDriftSpeed: 3,
  contentMicroDriftX: 2.05,
  contentMicroDriftY: 5,
  contentMicroDriftZ: 3,
  dragMomentumLag: 2,
  floatingBobAmplitude: 1,
  floatingBobSpeed: 1,
  gentleDriftAmplitude: 0.7,
  gentleDriftSpeed: 1,
  idleFrostAmount: 1,
  imageCycleDuration: 10,
  innerCubeRotationSpeed: 0.6,
  scrollParallax: 1,
  uvDriftSpeed: 1,
};

export const EFFECTS = {
  bloomBoost: 0.5,
  dofBokehScalePreview: 34,
  dofBokehScaleTile: 18,
  dofFocalLength: 0.25,
  envIntensity: 0.5,
  envMapIntensity: 1,
  iridescenceBoost: 0.1,
  lensDistortion: -0.05,
  roughnessBoost: -0.05,
  saturate: 0.9,
  vignetteAmountPreview: 0.06,
  vignetteAmountTile: 0.1,
};

export const CANVAS_CAMERA = {
  preview: {
    position: [10.8, 12.6, 10.8] as const,
    fov: 35,
  },
  // Slightly closer than preview so the cube reads large in widgets, with headroom so
  // glass/refraction and idle motion are not clipped by the canvas bounds.
  tile: {
    position: [7.1, 8.25, 7.1] as const,
    fov: 36,
  },
} as const;

export function getCanvasCamera(
  variant: NonNullable<ProjectArtifactRendererProps["variant"]>,
  distanceScale = 1,
) {
  const config =
    variant === "tile" ? CANVAS_CAMERA.tile : CANVAS_CAMERA.preview;
  return {
    position: [
      config.position[0] * distanceScale,
      config.position[1] * distanceScale,
      config.position[2] * distanceScale,
    ] as [number, number, number],
    fov: config.fov,
    near: 1,
    far: 100,
  };
}

export const NUM_PLANES = 6;
export const PLANE_SIZE = 4.2;
export const STACK_DEPTH = 3.5;
export const PLANE_OPACITY = 0.9;
export const PLANE_FADE_DURATION = 3;
export const PLANE_CASCADE_OFFSET = 0.15;
export const PLANE_CORNER_RADIUS = 0.073;
export const INNER_CUBE_SIZE = 7.8;
export const SPHERE_RADIUS = 4.5;
export const CONTENT_FADE_DURATION = 1.5;

export const TRANSPARENT_BACKGROUND_VARIANTS: readonly NonNullable<
  ProjectArtifactRendererProps["variant"]
>[] = ["preview", "tile"];

export function usesTransparentBackground(
  variant: NonNullable<ProjectArtifactRendererProps["variant"]>,
) {
  return TRANSPARENT_BACKGROUND_VARIANTS.includes(variant);
}

export function getSceneBackgroundColor(
  accentColor: string,
  variant: NonNullable<ProjectArtifactRendererProps["variant"]>,
) {
  const background = new THREE.Color("#f5f5f5");
  if (variant === "preview") {
    background.lerp(new THREE.Color(accentColor), 0.14);
  }
  return `#${background.getHexString()}`;
}
