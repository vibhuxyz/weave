import { type MutableRefObject, useMemo, useRef } from "react";
import type * as THREE from "three";
import type { ProjectArtifactRendererProps, ProjectArtifactState } from "../types";
import { CubeInteraction, PrototypeCube } from "./PrototypeCube";
import { SceneBackground, SceneEnvironment, TransparentSceneRender } from "./SceneChrome";
import { getSceneBackgroundColor, usesTransparentBackground } from "./constants";
import type { ArtifactRuntimeState, CameraAngles } from "./sceneMath";
import { useGlassTint, useMemoryTextures, useMorphedAccentColor } from "./sceneHooks";

export function ArtifactScene({
  environmentUrl,
  imageUrls,
  motionImpulse,
  runtimeRef,
  state,
  variant,
}: {
  environmentUrl: string;
  imageUrls: string[];
  motionImpulse: ProjectArtifactRendererProps["motionImpulse"];
  runtimeRef: MutableRefObject<ArtifactRuntimeState>;
  state: ProjectArtifactState;
  variant: NonNullable<ProjectArtifactRendererProps["variant"]>;
}) {
  const textures = useMemoryTextures(imageUrls);
  const shellRef = useRef<THREE.Mesh | null>(null);
  const cameraAnglesRef = useRef<CameraAngles>({ azimuth: 0, polar: 0 });
  const accentColorRef = useMorphedAccentColor(state.accentColor);
  const glassTintRef = useGlassTint(accentColorRef);
  const backgroundColor = useMemo(
    () => getSceneBackgroundColor(state.accentColor, variant),
    [state.accentColor, variant],
  );
  const hasTransparentBackground = usesTransparentBackground(variant);

  return (
    <>
      <SceneBackground
        color={backgroundColor}
        transparent={hasTransparentBackground}
      />
      <SceneEnvironment environmentUrl={environmentUrl} />
      <PrototypeCube
        cameraAnglesRef={cameraAnglesRef}
        glassTintRef={glassTintRef}
        mode={state.contentMode}
        motionImpulse={motionImpulse}
        runtimeRef={runtimeRef}
        shellRef={shellRef}
        textures={textures}
        variant={variant}
      />
      {variant === "preview" ? (
        <CubeInteraction
          cameraAnglesRef={cameraAnglesRef}
          runtimeRef={runtimeRef}
        />
      ) : null}
      {hasTransparentBackground ? <TransparentSceneRender /> : null}
    </>
  );
}
