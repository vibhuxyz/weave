import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  applyProjectArtifactCubeTexture,
  disposeProjectArtifactCubeMaterials,
} from "../projectArtifactThreeResources";
import type { ProjectArtifactContentMode } from "../types";
import {
  CONTENT_FADE_DURATION,
  INNER_CUBE_SIZE,
  NUM_PLANES,
  PLANE_CASCADE_OFFSET,
  PLANE_CORNER_RADIUS,
  PLANE_FADE_DURATION,
  PLANE_OPACITY,
  PLANE_SIZE,
  SCENE_ANIM,
  SPHERE_RADIUS,
  STACK_DEPTH,
} from "./constants";
import {
  advanceImageCycle,
  type ArtifactRuntimeRef,
  makeImageCycle,
  smoothstep,
  textureAt,
  type TextureList,
} from "./sceneMath";
import { disposeThreeResource, useStrictModeSafeDisposal } from "./sceneHooks";
import {
  backdropFragmentShader,
  backdropVertexShader,
  type BackdropUniforms,
  flatProjectionFragmentShader,
  flatProjectionVertexShader,
  type FlatProjectionUniforms,
  type PlaneUniforms,
  roundedPlaneFragmentShader,
  roundedPlaneVertexShader,
} from "./shaders";

const tempVecA = new THREE.Vector3();
const tempVecB = new THREE.Vector3();
const tempVecC = new THREE.Vector3();
const tempQuat = new THREE.Quaternion();

export function StackedPlanesContent({
  runtimeRef,
  textures,
}: {
  runtimeRef: ArtifactRuntimeRef;
  textures: TextureList;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const meshARef = useRef<THREE.Mesh[]>([]);
  const meshBRef = useRef<THREE.Mesh[]>([]);
  const backdropRef = useRef<THREE.Mesh>(null);
  const antiParallelRot = useRef(0);
  const cycleRef = useRef(
    makeImageCycle(runtimeRef.current.imageIndex, textures.length),
  );
  const planePositions = useMemo(() => {
    const positions: number[] = [];
    const halfDepth = STACK_DEPTH / 2;
    for (let i = 0; i < NUM_PLANES; i += 1) {
      positions.push(-halfDepth + (STACK_DEPTH / (NUM_PLANES - 1)) * i);
    }
    return positions;
  }, []);
  const uniforms = useRef({
    A: Array.from({ length: NUM_PLANES }, () => ({
      uMap: { value: null as THREE.Texture | null },
      uOpacity: { value: PLANE_OPACITY },
      uRadius: { value: PLANE_CORNER_RADIUS },
    })),
    B: Array.from({ length: NUM_PLANES }, () => ({
      uMap: { value: null as THREE.Texture | null },
      uOpacity: { value: 0 },
      uRadius: { value: PLANE_CORNER_RADIUS },
    })),
    backdrop: {
      uBoxSize: {
        value: new THREE.Vector3(
          (PLANE_SIZE * 1.56) / 2,
          (PLANE_SIZE * 1.56) / 2,
          STACK_DEPTH * 1.3,
        ),
      },
      uMap: { value: null as THREE.Texture | null },
      uMapNext: { value: null as THREE.Texture | null },
      uMix: { value: 0 },
      uOpacity: { value: 1 },
    },
  });

  useEffect(() => {
    const initialTexture = textureAt(textures, runtimeRef.current.imageIndex);
    uniforms.current.A.forEach((entry) => {
      entry.uMap.value = initialTexture;
    });
    uniforms.current.B.forEach((entry) => {
      entry.uMap.value = initialTexture;
    });
    uniforms.current.backdrop.uMap.value = initialTexture;
    uniforms.current.backdrop.uMapNext.value = initialTexture;
  }, [runtimeRef, textures]);

  useFrame((frameState, delta) => {
    const cycle = cycleRef.current;
    const runtime = runtimeRef.current;
    const time = frameState.clock.elapsedTime;
    advanceImageCycle({
      cycle,
      delta,
      fadeDuration: PLANE_FADE_DURATION,
      runtime,
      textureCount: textures.length,
      time,
      totalDuration:
        PLANE_FADE_DURATION +
        PLANE_CASCADE_OFFSET * (NUM_PLANES - 1) * PLANE_FADE_DURATION,
    });

    const texCurrent = textureAt(textures, cycle.currentIndex);
    const texNext = textureAt(textures, cycle.nextIndex);
    for (let i = 0; i < NUM_PLANES; i += 1) {
      const meshA = meshARef.current[i];
      const meshB = meshBRef.current[i];
      if (!meshA || !meshB) continue;
      const matA = meshA.material as THREE.ShaderMaterial & { uniforms: PlaneUniforms };
      const matB = meshB.material as THREE.ShaderMaterial & { uniforms: PlaneUniforms };
      const planeOffset = i * PLANE_CASCADE_OFFSET;
      const localProgress = cycle.isFading
        ? Math.min(
            1,
            Math.max(
              0,
              (cycle.fadeProgress - planeOffset) /
                (1 - PLANE_CASCADE_OFFSET * (NUM_PLANES - 1)),
            ),
          )
        : 0;
      const eased = smoothstep(localProgress);
      matA.uniforms.uMap.value = texCurrent;
      matB.uniforms.uMap.value = texNext;
      matA.uniforms.uOpacity.value = PLANE_OPACITY * (1 - eased);
      matB.uniforms.uOpacity.value = PLANE_OPACITY * eased;
    }

    if (backdropRef.current) {
      const material = backdropRef.current.material as THREE.ShaderMaterial & {
        uniforms: BackdropUniforms;
      };
      const midOffset = ((NUM_PLANES - 1) / 2) * PLANE_CASCADE_OFFSET;
      const midProgress = cycle.isFading
        ? Math.min(
            1,
            Math.max(
              0,
              (cycle.fadeProgress - midOffset) /
                (1 - PLANE_CASCADE_OFFSET * (NUM_PLANES - 1)),
            ),
          )
        : 0;
      material.uniforms.uMap.value = texCurrent;
      material.uniforms.uMapNext.value = texNext;
      material.uniforms.uMix.value = smoothstep(midProgress);
    }

    if (groupRef.current) {
      const cameraPosition = frameState.camera.position;
      const worldPos = groupRef.current.getWorldPosition(tempVecA);
      tempVecB.copy(cameraPosition).sub(worldPos).normalize();
      tempVecC
        .set(0, 0, 1)
        .applyQuaternion(groupRef.current.getWorldQuaternion(tempQuat));
      const dotZ = Math.abs(tempVecB.dot(tempVecC));
      const threshold = 0.75;
      const maxRotation = 0.35;
      let targetRotY = 0;
      if (dotZ < threshold) {
        const t = 1 - dotZ / threshold;
        const crossSign =
          Math.sign(tempVecB.x * tempVecC.z - tempVecB.z * tempVecC.x) || 1;
        targetRotY = t * t * maxRotation * crossSign;
      }
      antiParallelRot.current += (targetRotY - antiParallelRot.current) * 0.05;
      groupRef.current.rotation.y = antiParallelRot.current;
      groupRef.current.position.x =
        Math.sin(time * 0.08 * SCENE_ANIM.gentleDriftSpeed) *
        0.15 *
        SCENE_ANIM.gentleDriftAmplitude;
      groupRef.current.position.y =
        Math.cos(time * 0.06 * SCENE_ANIM.gentleDriftSpeed) *
        0.1 *
        SCENE_ANIM.gentleDriftAmplitude;
      const breatheWave =
        Math.sin(time * 1.8 * SCENE_ANIM.breathingSpeed) * 0.6 +
        Math.sin(time * 1.14 * SCENE_ANIM.breathingSpeed) * 0.4;
      const breathe =
        1 -
        0.075 * SCENE_ANIM.breathingAmplitude +
        0.075 * SCENE_ANIM.breathingAmplitude * breatheWave;
      groupRef.current.scale.setScalar(breathe);
    }
  });

  return (
    <group ref={groupRef} renderOrder={-1000}>
      <mesh ref={backdropRef}>
        <boxGeometry
          args={[PLANE_SIZE * 1.56, PLANE_SIZE * 1.56, STACK_DEPTH * 2.6]}
        />
        <shaderMaterial
          depthTest={false}
          fragmentShader={backdropFragmentShader}
          side={THREE.BackSide}
          transparent
          uniforms={uniforms.current.backdrop}
          vertexShader={backdropVertexShader}
        />
      </mesh>
      {planePositions.map((z, index) => (
        <group key={z} position={[0, 0, z]}>
          <mesh
            ref={(element) => {
              if (element) meshARef.current[index] = element;
            }}
          >
            <planeGeometry args={[PLANE_SIZE, PLANE_SIZE]} />
            <shaderMaterial
              depthTest={false}
              fragmentShader={roundedPlaneFragmentShader}
              side={THREE.DoubleSide}
              transparent
              uniforms={uniforms.current.A[index]}
              vertexShader={roundedPlaneVertexShader}
            />
          </mesh>
          <mesh
            position={[0, 0, 0.001]}
            ref={(element) => {
              if (element) meshBRef.current[index] = element;
            }}
          >
            <planeGeometry args={[PLANE_SIZE, PLANE_SIZE]} />
            <shaderMaterial
              depthTest={false}
              fragmentShader={roundedPlaneFragmentShader}
              side={THREE.DoubleSide}
              transparent
              uniforms={uniforms.current.B[index]}
              vertexShader={roundedPlaneVertexShader}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function ImageSphereContent({
  runtimeRef,
  textures,
}: {
  runtimeRef: ArtifactRuntimeRef;
  textures: TextureList;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const cycleRef = useRef(
    makeImageCycle(runtimeRef.current.imageIndex, textures.length),
  );
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        depthTest: false,
        fragmentShader: flatProjectionFragmentShader,
        side: THREE.DoubleSide,
        transparent: true,
        uniforms: {
          uBoundsMin: {
            value: new THREE.Vector3(
              -SPHERE_RADIUS,
              -SPHERE_RADIUS,
              -SPHERE_RADIUS,
            ),
          },
          uBoundsSize: {
            value: new THREE.Vector3(
              SPHERE_RADIUS * 2,
              SPHERE_RADIUS * 2,
              SPHERE_RADIUS * 2,
            ),
          },
          uMix: { value: 0 },
          uOpacity: { value: 0.9 },
          uTexture: { value: null as THREE.Texture | null },
          uTexture2: { value: null as THREE.Texture | null },
        },
        vertexShader: flatProjectionVertexShader,
      }) as THREE.ShaderMaterial & { uniforms: FlatProjectionUniforms },
    [],
  );

  useStrictModeSafeDisposal(material, disposeThreeResource);

  useFrame((frameState, delta) => {
    const cycle = cycleRef.current;
    const runtime = runtimeRef.current;
    advanceImageCycle({
      cycle,
      delta,
      fadeDuration: CONTENT_FADE_DURATION,
      runtime,
      textureCount: textures.length,
      time: frameState.clock.elapsedTime,
    });
    material.uniforms.uTexture.value = textureAt(textures, cycle.currentIndex);
    material.uniforms.uTexture2.value = textureAt(textures, cycle.nextIndex);
    material.uniforms.uMix.value = cycle.isFading ? cycle.fadeProgress : 0;

    if (groupRef.current) {
      const time = frameState.clock.elapsedTime;
      const breatheWave =
        Math.sin(time * 1.2 * SCENE_ANIM.breathingSpeed) * 0.6 +
        Math.sin(time * 0.8 * SCENE_ANIM.breathingSpeed) * 0.4;
      const breathe =
        1 -
        0.05 * SCENE_ANIM.breathingAmplitude +
        0.05 * SCENE_ANIM.breathingAmplitude * breatheWave;
      groupRef.current.scale.setScalar(breathe);
    }
  });

  return (
    <group ref={groupRef} renderOrder={-1000}>
      <mesh material={material}>
        <sphereGeometry args={[SPHERE_RADIUS, 64, 64]} />
      </mesh>
    </group>
  );
}

export function InnerCubeContent({
  mode,
  runtimeRef,
  textures,
}: {
  mode: "cube" | "cubeStatic";
  runtimeRef: ArtifactRuntimeRef;
  textures: TextureList;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const cubeRef = useRef<THREE.Group>(null);
  const cycleRef = useRef(
    makeImageCycle(runtimeRef.current.imageIndex, textures.length),
  );
  const drifts = useMemo(
    () => [
      { sx: 0.02, sy: 0.01 },
      { sx: -0.02, sy: 0.015 },
      { sx: 0.01, sy: 0.02 },
      { sx: -0.01, sy: -0.02 },
      { sx: 0.015, sy: -0.01 },
      { sx: -0.015, sy: 0.01 },
    ],
    [],
  );
  const materialsA = useMemo(
    () =>
      Array.from(
        { length: 6 },
        () =>
          new THREE.MeshBasicMaterial({
            depthTest: false,
            map: textureAt(textures, runtimeRef.current.imageIndex),
            opacity: 0.9,
            side: THREE.FrontSide,
            transparent: true,
          }),
      ),
    [runtimeRef, textures],
  );
  const materialsB = useMemo(
    () =>
      Array.from(
        { length: 6 },
        () =>
          new THREE.MeshBasicMaterial({
            depthTest: false,
            map: textureAt(textures, runtimeRef.current.imageIndex + 1),
            opacity: 0,
            side: THREE.FrontSide,
            transparent: true,
          }),
      ),
    [runtimeRef, textures],
  );

  const materials = useMemo(
    () => [...materialsA, ...materialsB],
    [materialsA, materialsB],
  );
  useStrictModeSafeDisposal(materials, disposeProjectArtifactCubeMaterials);

  const applyCubeTexture = (
    material: THREE.MeshBasicMaterial,
    texture: THREE.Texture,
    driftFaceIndex: number,
    time: number,
  ) => {
    const map = applyProjectArtifactCubeTexture({
      cloneForUvTransform: mode === "cubeStatic",
      material,
      texture,
    });

    const drift = drifts[driftFaceIndex];
    if (mode !== "cubeStatic" || !drift) {
      return;
    }

    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.offset.x = drift.sx * time * SCENE_ANIM.uvDriftSpeed;
    map.offset.y = drift.sy * time * SCENE_ANIM.uvDriftSpeed;
  };

  useFrame((frameState, delta) => {
    const cycle = cycleRef.current;
    const runtime = runtimeRef.current;
    const time = frameState.clock.elapsedTime;
    advanceImageCycle({
      cycle,
      delta,
      fadeDuration: CONTENT_FADE_DURATION,
      runtime,
      textureCount: textures.length,
      time,
    });

    const texA = textureAt(textures, cycle.currentIndex);
    const texB = textureAt(textures, cycle.nextIndex);
    const mix = cycle.isFading ? cycle.fadeProgress : 0;
    materialsA.forEach((material, index) => {
      applyCubeTexture(material, texA, index, time);
      material.opacity = 0.9 * (1 - mix);
    });
    materialsB.forEach((material, index) => {
      applyCubeTexture(material, texB, index, time);
      material.opacity = 0.9 * mix;
    });

    if (cubeRef.current && mode === "cube") {
      cubeRef.current.rotation.x += 0.001 * SCENE_ANIM.innerCubeRotationSpeed;
      cubeRef.current.rotation.y += 0.002 * SCENE_ANIM.innerCubeRotationSpeed;
    }
    if (groupRef.current) {
      const breatheWave =
        Math.sin(time * 1.0 * SCENE_ANIM.breathingSpeed) * 0.6 +
        Math.sin(time * 0.7 * SCENE_ANIM.breathingSpeed) * 0.4;
      const breathe =
        1 -
        0.07 * SCENE_ANIM.breathingAmplitude +
        0.07 * SCENE_ANIM.breathingAmplitude * breatheWave;
      groupRef.current.scale.setScalar(breathe);
    }
  });

  return (
    <group ref={groupRef} renderOrder={-1000}>
      <group ref={cubeRef}>
        <mesh material={materialsA}>
          <boxGeometry
            args={[INNER_CUBE_SIZE, INNER_CUBE_SIZE, INNER_CUBE_SIZE]}
          />
        </mesh>
        <mesh material={materialsB}>
          <boxGeometry
            args={[INNER_CUBE_SIZE, INNER_CUBE_SIZE, INNER_CUBE_SIZE]}
          />
        </mesh>
      </group>
    </group>
  );
}

export function MemoryContent({
  mode,
  runtimeRef,
  textures,
}: {
  mode: ProjectArtifactContentMode;
  runtimeRef: ArtifactRuntimeRef;
  textures: TextureList;
}) {
  if (mode === "planes") {
    return <StackedPlanesContent runtimeRef={runtimeRef} textures={textures} />;
  }
  if (mode === "sphere") {
    return <ImageSphereContent runtimeRef={runtimeRef} textures={textures} />;
  }
  return (
    <InnerCubeContent
      mode={mode === "cubeStatic" ? "cubeStatic" : "cube"}
      runtimeRef={runtimeRef}
      textures={textures}
    />
  );
}
