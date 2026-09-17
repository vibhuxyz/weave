import { type ComponentRef, type MutableRefObject, useEffect, useRef } from "react";
import { type ThreeEvent, useFrame } from "@react-three/fiber";
import { MeshTransmissionMaterial, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { PROJECT_ARTIFACT_CUBE_MODEL_URL } from "../assets";
import type { ProjectArtifactContentMode, ProjectArtifactRendererProps } from "../types";
import { MemoryContent } from "./ArtifactContent";
import {
  CLICK_VISUAL_DURATION,
  CUBE_POINTER_CLICK_MS,
  CUBE_POINTER_CLICK_PX,
  CUBE_UNIFORM_SIZE,
  EFFECTS,
  IDLE_THRESHOLD_MS,
  MATERIAL_ANIM,
  SCENE_ANIM,
  SLEEP_THRESHOLD_MS,
} from "./constants";
import {
  animatedMaterialValue,
  type ArtifactRuntimeRef,
  type CameraAnglesRef,
  clamp01,
  clickEnvelope,
  recordInteraction,
  type TextureList,
} from "./sceneMath";

interface CubeGltf {
  nodes: Record<string, THREE.Mesh>;
}

interface TransmissionMaterialHandle {
  anisotropy: number;
  attenuationColor?: THREE.Color;
  chromaticAberration: number;
  color?: THREE.Color;
  distortion: number;
  distortionScale: number;
  envMapIntensity: number;
  iridescence: number;
  iridescenceIOR: number;
  roughness: number;
  thickness: number;
}

type OrbitControlsHandle = ComponentRef<typeof OrbitControls>;
type CubePointerEvent = ThreeEvent<PointerEvent>;

export function PrototypeCube({
  cameraAnglesRef,
  glassTintRef,
  mode,
  motionImpulse,
  runtimeRef,
  shellRef,
  textures,
  variant,
}: {
  cameraAnglesRef: CameraAnglesRef;
  glassTintRef: MutableRefObject<THREE.Color>;
  mode: ProjectArtifactContentMode;
  motionImpulse: ProjectArtifactRendererProps["motionImpulse"];
  runtimeRef: ArtifactRuntimeRef;
  shellRef: MutableRefObject<THREE.Mesh | null>;
  textures: TextureList;
  variant: NonNullable<ProjectArtifactRendererProps["variant"]>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const contentRef = useRef<THREE.Group>(null);
  const materialRef = useRef<TransmissionMaterialHandle | null>(null);
  const { nodes } = useGLTF(
    PROJECT_ARTIFACT_CUBE_MODEL_URL,
  ) as unknown as CubeGltf;
  const geometry = nodes.Cube?.geometry ?? null;
  const clickTime = useRef(0);
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);
  const pointerDownTime = useRef(0);
  const hoverLean = useRef({ x: 0, y: 0 });
  const hoverWarmth = useRef(0);
  const proximityEnergy = useRef(0);
  const contentLag = useRef({ x: 0, y: 0, z: 0 });
  const contentDrift = useRef({ x: 0, y: 0, z: 0 });
  const hoverSpin = useRef({ x: 0, y: 0 });
  const hoverSpinVelocity = useRef({ x: 0, y: 0 });
  const previousHoverSpin = useRef({ x: 0, y: 0 });
  const dragVisualAmount = useRef(0);
  const dragVisualPeak = useRef(0);
  const scrollOffset = useRef(0);
  const idleFrost = useRef(0);
  const releaseBounceMat = useRef(0);
  const releaseBounceVel = useRef(0);
  const lastMotionImpulse = useRef(0);
  const wasDragging = useRef(false);
  const previousMode = useRef(mode);
  const interactive = variant === "preview";

  useEffect(() => {
    if (previousMode.current !== mode) {
      runtimeRef.current.contentTransition = 0;
      runtimeRef.current.isTransitioning = true;
      previousMode.current = mode;
    }
  }, [mode, runtimeRef]);

  useEffect(() => {
    if (variant !== "tile" || !motionImpulse) return;
    if (motionImpulse.sequence === lastMotionImpulse.current) return;

    lastMotionImpulse.current = motionImpulse.sequence;
    hoverSpinVelocity.current.x = THREE.MathUtils.clamp(
      hoverSpinVelocity.current.x + motionImpulse.deltaY * 11.5,
      -5,
      5,
    );
    hoverSpinVelocity.current.y = THREE.MathUtils.clamp(
      hoverSpinVelocity.current.y + motionImpulse.deltaX * 11.5,
      -5,
      5,
    );
  }, [motionImpulse, variant]);

  useFrame((frameState, delta) => {
    const runtime = runtimeRef.current;
    const time = frameState.clock.elapsedTime;
    const now = Date.now();
    runtime.isIdle = now - runtime.lastInteractionTime > IDLE_THRESHOLD_MS;
    const isDormant = now - runtime.lastInteractionTime > SLEEP_THRESHOLD_MS;

    if (runtime.isTransitioning) {
      runtime.contentTransition = Math.min(
        1,
        runtime.contentTransition + delta / 1.1,
      );
      if (runtime.contentTransition >= 1) runtime.isTransitioning = false;
    }

    const cursorDist = Math.sqrt(
      runtime.cursorPosition.x * runtime.cursorPosition.x +
        runtime.cursorPosition.y * runtime.cursorPosition.y,
    );
    const targetProximity = runtime.isHovered ? 1 : Math.max(0, 1 - cursorDist);
    proximityEnergy.current +=
      (targetProximity - proximityEnergy.current) * 0.02;

    const attractStrength = interactive ? 0 : 0;
    hoverLean.current.x +=
      (runtime.cursorPosition.x * attractStrength - hoverLean.current.x) * 0.06;
    hoverLean.current.y +=
      (runtime.cursorPosition.y * attractStrength - hoverLean.current.y) * 0.06;
    hoverWarmth.current +=
      ((runtime.isHovered ? 0.6 : 0) - hoverWarmth.current) * 0.03;

    const dragTarget = runtime.isDragging
      ? clamp01((runtime.dragVelocity - 0.00025) / 0.004)
      : 0;
    dragVisualAmount.current +=
      (dragTarget - dragVisualAmount.current) * (dragTarget > 0 ? 0.18 : 0.08);
    const dragAmount = dragVisualAmount.current;
    const longPressAmount = dragAmount;
    const dragActive = dragAmount > 0.03;
    if (dragActive) {
      dragVisualPeak.current = Math.max(dragVisualPeak.current, dragAmount);
    }

    if (wasDragging.current && !dragActive) {
      releaseBounceVel.current = 0.8 * dragVisualPeak.current;
      dragVisualPeak.current = 0;
    }
    wasDragging.current = dragActive;

    const springForce = -25 * releaseBounceMat.current;
    const dampForce = -4 * releaseBounceVel.current;
    releaseBounceVel.current += (springForce + dampForce) * (1 / 60);
    releaseBounceMat.current += releaseBounceVel.current * (1 / 60);
    if (
      Math.abs(releaseBounceMat.current) < 0.001 &&
      Math.abs(releaseBounceVel.current) < 0.001
    ) {
      releaseBounceMat.current = 0;
      releaseBounceVel.current = 0;
    }

    const targetFrost =
      runtime.isIdle || isDormant ? 0.8 * SCENE_ANIM.idleFrostAmount : 0;
    idleFrost.current += (targetFrost - idleFrost.current) * 0.005;
    scrollOffset.current *= 0.95;
    if (variant === "tile") {
      const spinDelta = Math.min(delta, 1 / 30);
      const spring = 8.2;
      const damping = 0.965 ** (spinDelta * 60);
      hoverSpinVelocity.current.x += -hoverSpin.current.x * spring * spinDelta;
      hoverSpinVelocity.current.y += -hoverSpin.current.y * spring * spinDelta;
      hoverSpinVelocity.current.x *= damping;
      hoverSpinVelocity.current.y *= damping;
      hoverSpin.current.x = THREE.MathUtils.clamp(
        hoverSpin.current.x + hoverSpinVelocity.current.x * spinDelta,
        -0.72,
        0.72,
      );
      hoverSpin.current.y = THREE.MathUtils.clamp(
        hoverSpin.current.y + hoverSpinVelocity.current.y * spinDelta,
        -0.72,
        0.72,
      );
      if (Math.abs(hoverSpin.current.x) < 0.0001) hoverSpin.current.x = 0;
      if (Math.abs(hoverSpin.current.y) < 0.0001) hoverSpin.current.y = 0;
      if (Math.abs(hoverSpinVelocity.current.x) < 0.0001) {
        hoverSpinVelocity.current.x = 0;
      }
      if (Math.abs(hoverSpinVelocity.current.y) < 0.0001) {
        hoverSpinVelocity.current.y = 0;
      }
    } else {
      hoverSpin.current.x = 0;
      hoverSpin.current.y = 0;
      hoverSpinVelocity.current.x = 0;
      hoverSpinVelocity.current.y = 0;
      previousHoverSpin.current.x = 0;
      previousHoverSpin.current.y = 0;
    }

    const tileMotionScale = variant === "tile" ? 0.55 : 1;
    const bobY =
      (Math.sin(time * 0.6 * SCENE_ANIM.floatingBobSpeed) * 0.08 +
        Math.sin(time * 0.23 * SCENE_ANIM.floatingBobSpeed) * 0.04) *
      SCENE_ANIM.floatingBobAmplitude *
      tileMotionScale;
    const bobX =
      Math.sin(time * 0.4 * SCENE_ANIM.floatingBobSpeed + 1) *
      0.03 *
      SCENE_ANIM.floatingBobAmplitude *
      tileMotionScale;

    if (shellRef.current) {
      shellRef.current.scale.set(
        CUBE_UNIFORM_SIZE,
        CUBE_UNIFORM_SIZE,
        CUBE_UNIFORM_SIZE,
      );
    }

    if (contentRef.current) {
      const momentumDecay = 0.987;
      const momentumGain = 17.5 * SCENE_ANIM.dragMomentumLag;
      const maxMomentum = 1.75;
      if (Math.abs(runtime.dragVelocity) > 0.001) {
        contentLag.current.x +=
          runtime.dragVelocity * Math.sin(time * 2.3) * momentumGain * 0.016;
        contentLag.current.y +=
          runtime.dragVelocity * Math.cos(time * 1.7) * momentumGain * 0.016;
      }
      contentLag.current.x = THREE.MathUtils.clamp(
        contentLag.current.x,
        -maxMomentum,
        maxMomentum,
      );
      contentLag.current.y = THREE.MathUtils.clamp(
        contentLag.current.y,
        -maxMomentum,
        maxMomentum,
      );
      contentLag.current.x *= momentumDecay;
      contentLag.current.y *= momentumDecay;

      const driftSpeed = SCENE_ANIM.contentMicroDriftSpeed;
      contentDrift.current.x =
        (Math.sin(time * 0.17 * driftSpeed + 1.3) * 0.04 +
          Math.sin(time * 0.31 * driftSpeed) * 0.02) *
        SCENE_ANIM.contentMicroDriftX;
      contentDrift.current.y =
        (Math.sin(time * 0.13 * driftSpeed + 2.7) * 0.03 +
          Math.cos(time * 0.23 * driftSpeed) * 0.02) *
        SCENE_ANIM.contentMicroDriftY;
      contentDrift.current.z =
        (Math.sin(time * 0.11 * driftSpeed + 4.1) * 0.04 +
          Math.cos(time * 0.19 * driftSpeed) * 0.02) *
        SCENE_ANIM.contentMicroDriftZ;
      contentRef.current.rotation.x =
        contentLag.current.x + contentDrift.current.x;
      contentRef.current.rotation.y =
        contentLag.current.y + contentDrift.current.y;
      contentRef.current.rotation.z = contentDrift.current.z;
      contentRef.current.position.z =
        scrollOffset.current * 1.3 * SCENE_ANIM.scrollParallax;
    }

    if (materialRef.current) {
      const material = materialRef.current;
      const energy = 1 + proximityEnergy.current * 0.5;
      const bounce = releaseBounceMat.current;
      const animatedRoughness = Math.max(
        0,
        animatedMaterialValue(MATERIAL_ANIM.roughness, time, 0.16, 0.1) +
          idleFrost.current * 0.15 +
          EFFECTS.roughnessBoost,
      );
      material.roughness = animatedRoughness;
      material.thickness =
        animatedMaterialValue(MATERIAL_ANIM.thickness, time, 0.44, 0.28, 2) +
        bounce * 0.5;
      material.chromaticAberration =
        animatedMaterialValue(
          MATERIAL_ANIM.chromaticAberration,
          time,
          0.6,
          0.38,
          3,
        ) *
          energy +
        hoverWarmth.current * 0.03;
      material.distortion =
        animatedMaterialValue(MATERIAL_ANIM.distortion, time, 0.2, 0.13, 4) *
          energy +
        Math.abs(bounce) * 0.15;
      material.distortionScale = animatedMaterialValue(
        MATERIAL_ANIM.distortionScale,
        time,
        0.09,
        0.055,
        5,
      );
      material.anisotropy = animatedMaterialValue(
        MATERIAL_ANIM.anisotropy,
        time,
        0.07,
        0.045,
        7,
      );
      material.iridescence =
        animatedMaterialValue(MATERIAL_ANIM.iridescence, time, 0.065, 0.04, 8) +
        hoverWarmth.current * 0.1 +
        EFFECTS.iridescenceBoost;
      material.iridescenceIOR = animatedMaterialValue(
        MATERIAL_ANIM.iridescenceIOR,
        time,
        0.04,
        0.025,
        9,
      );
      if (longPressAmount > 0.01) {
        material.thickness += longPressAmount * 0.25;
        material.distortion += longPressAmount * 0.25;
        material.iridescence += longPressAmount * 0.05;
      }
      if (runtime.isTransitioning) {
        const transitionPulse = Math.sin(runtime.contentTransition * Math.PI);
        material.thickness += transitionPulse * 1.5;
        material.roughness += transitionPulse * 0.12;
        material.distortion += transitionPulse * 0.15;
        material.chromaticAberration += transitionPulse * 0.02;
      }
      material.envMapIntensity = EFFECTS.envMapIntensity;
      if (material.attenuationColor instanceof THREE.Color) {
        material.attenuationColor.copy(glassTintRef.current);
      }
      if (material.color instanceof THREE.Color) {
        material.color.copy(glassTintRef.current);
      }
    }

    if (
      clickTime.current > 0 &&
      SCENE_ANIM.clickPulseStrength > 0 &&
      shellRef.current
    ) {
      const elapsed = performance.now() / 1000 - clickTime.current;
      const envelope = clickEnvelope(elapsed, CLICK_VISUAL_DURATION);
      if (envelope > 0) {
        const pulse = envelope * 0.018 * SCENE_ANIM.clickPulseStrength;
        const scale = CUBE_UNIFORM_SIZE * (1 + pulse);
        shellRef.current.scale.set(scale, scale, scale);
        if (materialRef.current) {
          const flash = envelope * SCENE_ANIM.clickPulseStrength;
          materialRef.current.chromaticAberration += flash * 0.12;
          materialRef.current.distortion += flash * 0.08;
        }
      }
    }

    if (groupRef.current) {
      const baseTiltX =
        Math.sin(time * 0.15 * SCENE_ANIM.baseTiltSpeed) *
        0.015 *
        SCENE_ANIM.baseTiltAmplitude;
      const baseTiltZ =
        Math.cos(time * 0.12 * SCENE_ANIM.baseTiltSpeed) *
        0.01 *
        SCENE_ANIM.baseTiltAmplitude;
      const dampFactor = 1 - dragAmount * 0.9;
      groupRef.current.rotation.z +=
        (baseTiltZ * dampFactor - groupRef.current.rotation.z) * 0.03;

      const combinedAngle =
        cameraAnglesRef.current.azimuth + groupRef.current.rotation.y;
      const wrapped =
        (((combinedAngle % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2)) -
        Math.PI / 4;
      const force = -Math.sin(2 * wrapped);
      const momentumFade = Math.max(0, 1 - runtime.dragVelocity / 0.003);
      const antiFlatStrength = dragActive ? 0 : 0.006 * momentumFade;
      const tileSpinX = variant === "tile" ? hoverSpin.current.x : 0;
      const tileSpinY = variant === "tile" ? hoverSpin.current.y : 0;
      const tileSpinDeltaX = tileSpinX - previousHoverSpin.current.x;
      const tileSpinDeltaY = tileSpinY - previousHoverSpin.current.y;
      previousHoverSpin.current.x = tileSpinX;
      previousHoverSpin.current.y = tileSpinY;

      groupRef.current.rotation.y += force * antiFlatStrength + tileSpinDeltaY;
      groupRef.current.rotation.x += tileSpinDeltaX;
      groupRef.current.rotation.x +=
        (baseTiltX * dampFactor - groupRef.current.rotation.x) *
        (variant === "tile" ? 0.045 : 0.03);

      const camera = frameState.camera;
      const matrix = camera.matrixWorld.elements;
      const leanAmount = variant === "tile" ? 1.1 : 2.1;
      const leanX = hoverLean.current.x * leanAmount;
      const leanY = hoverLean.current.y * leanAmount;
      const targetX = bobX + matrix[0] * leanX + matrix[4] * leanY;
      const targetY = 0.25 + bobY + matrix[1] * leanX + matrix[5] * leanY;
      const targetZ = matrix[2] * leanX + matrix[6] * leanY;
      groupRef.current.position.x +=
        (targetX - groupRef.current.position.x) * 0.06;
      groupRef.current.position.y +=
        (targetY - groupRef.current.position.y) * 0.06;
      groupRef.current.position.z +=
        (targetZ - groupRef.current.position.z) * 0.06;
    }
  });

  useFrame(() => {
    if (contentRef.current) contentRef.current.visible = false;
  }, 0.5);

  useFrame(() => {
    if (contentRef.current) contentRef.current.visible = true;
  }, 2);

  const handlePointerDown = (event: CubePointerEvent) => {
    if (!interactive) return;
    event.stopPropagation();
    pointerDownPos.current = { x: event.clientX, y: event.clientY };
    pointerDownTime.current = performance.now();
    runtimeRef.current.isPointerDown = true;
    recordInteraction(runtimeRef);
  };

  const handlePointerUp = (event: CubePointerEvent) => {
    if (!interactive || !pointerDownPos.current) return;
    event.stopPropagation();
    const dx = event.clientX - pointerDownPos.current.x;
    const dy = event.clientY - pointerDownPos.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const elapsed = performance.now() - pointerDownTime.current;
    pointerDownPos.current = null;
    runtimeRef.current.isPointerDown = false;
    if (dist < CUBE_POINTER_CLICK_PX && elapsed < CUBE_POINTER_CLICK_MS) {
      clickTime.current = performance.now() / 1000;
      runtimeRef.current.clickPulse = Date.now();
      recordInteraction(runtimeRef);
    }
  };

  const handlePointerOver = () => {
    if (!interactive) return;
    runtimeRef.current.isHovered = true;
    recordInteraction(runtimeRef);
  };

  const handlePointerOut = () => {
    if (!interactive) return;
    runtimeRef.current.isHovered = false;
    runtimeRef.current.isPointerDown = false;
    pointerDownPos.current = null;
  };

  return (
    <group ref={groupRef}>
      <mesh
        castShadow
        geometry={geometry ?? undefined}
        name="CubeShell"
        onPointerDown={interactive ? handlePointerDown : undefined}
        onPointerOut={interactive ? handlePointerOut : undefined}
        onPointerOver={interactive ? handlePointerOver : undefined}
        onPointerUp={interactive ? handlePointerUp : undefined}
        ref={shellRef}
        scale={[CUBE_UNIFORM_SIZE, CUBE_UNIFORM_SIZE, CUBE_UNIFORM_SIZE]}
      >
        {geometry ? null : <boxGeometry args={[1.65, 1.65, 1.65]} />}
        <MeshTransmissionMaterial
          ref={materialRef}
          anisotropy={0}
          attenuationColor={glassTintRef.current}
          attenuationDistance={4.8}
          backside
          backsideEnvMapIntensity={1}
          backsideThickness={0.5}
          chromaticAberration={0.01}
          color={glassTintRef.current}
          distortion={0}
          distortionScale={0}
          iridescence={0}
          iridescenceIOR={1}
          iridescenceThicknessRange={[0, 400]}
          samples={4}
          thickness={0.5}
          transmission={1}
        />
      </mesh>
      <group ref={contentRef}>
        <MemoryContent
          mode={mode}
          runtimeRef={runtimeRef}
          textures={textures}
        />
      </group>
    </group>
  );
}

export function CubeInteraction({
  cameraAnglesRef,
  runtimeRef,
}: {
  cameraAnglesRef: CameraAnglesRef;
  runtimeRef: ArtifactRuntimeRef;
}) {
  const controlsRef = useRef<OrbitControlsHandle | null>(null);
  const prevAzimuth = useRef(0);
  const prevPolar = useRef(0);

  useFrame(() => {
    if (!controlsRef.current) return;
    const controls = controlsRef.current;
    const azimuth = controls.getAzimuthalAngle();
    const polar = controls.getPolarAngle();
    cameraAnglesRef.current.azimuth = azimuth;
    cameraAnglesRef.current.polar = polar;
    const dAzimuth = azimuth - prevAzimuth.current;
    const dPolar = polar - prevPolar.current;
    const angularVelocity = Math.sqrt(dAzimuth * dAzimuth + dPolar * dPolar);
    prevAzimuth.current = azimuth;
    prevPolar.current = polar;

    const runtime = runtimeRef.current;
    if (runtime.isDragging) {
      runtime.dragVelocity = angularVelocity;
    } else if (runtime.dragVelocity > 0.0001) {
      runtime.dragVelocity *= 0.98;
    } else {
      runtime.dragVelocity = 0;
    }
    controls.autoRotate = false;
  });

  return (
    <OrbitControls
      ref={controlsRef}
      dampingFactor={0.04}
      enableDamping
      enablePan={false}
      enableZoom={false}
      maxDistance={30}
      minDistance={15}
      onEnd={() => {
        runtimeRef.current.isDragging = false;
      }}
      onStart={() => {
        runtimeRef.current.isDragging = true;
        recordInteraction(runtimeRef);
      }}
      rotateSpeed={1.2}
    />
  );
}
