import {
  Suspense,
  useCallback,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Canvas } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { cn } from "@/shared/lib";
import { PROJECT_ARTIFACT_CUBE_MODEL_URL } from "./assets";
import {
  ArtifactScene,
  CanvasRenderSync,
  EFFECTS,
  getCanvasCamera,
  getSceneBackgroundColor,
  initialImageIndexForState,
  makeRuntime,
  recordInteraction,
  TileResizeRecovery,
  type ArtifactRuntimeState,
  usesTransparentBackground,
} from "./renderer";
import { useRenderWindowVisible } from "./renderVisibility";
import type { ProjectArtifactRendererProps } from "./types";

const VISUAL_READY_FRAME_DELAY = 2;
const TILE_VISUAL_READY_FRAME_DELAY = 3;

/** Persists across Home navigations so tile cubes skip the first-load fade on return. */
let projectArtifactTileHasRevealed = false;

export function ProjectArtifactRenderer({
  state,
  environmentUrl,
  imageUrls,
  className,
  cameraDistanceScale = 1,
  gestureFreezeActive = false,
  motionImpulse,
  onGlCanvasReady,
  renderPaused = false,
  variant = "preview",
}: ProjectArtifactRendererProps) {
  const initialImageIndex = initialImageIndexForState(
    state,
    imageUrls.length,
    variant,
  );
  const runtimeRef = useRef<ArtifactRuntimeState>(
    makeRuntime(initialImageIndex),
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const interactive = variant === "preview";
  const isRenderWindowVisible = useRenderWindowVisible();
  const pauseRenderLoop = renderPaused || !isRenderWindowVisible;
  const hasTransparentBackground = usesTransparentBackground(variant);
  const canvasBackground = useMemo(
    () => getSceneBackgroundColor(state.accentColor, variant),
    [state.accentColor, variant],
  );
  const [contextRecoveryKey, setContextRecoveryKey] = useState(0);
  const [layoutEpoch, setLayoutEpoch] = useState(0);
  const lastContextRecoveryAtRef = useRef(0);
  const requestSoftRecovery = useCallback(() => {
    const now = Date.now();
    if (now - lastContextRecoveryAtRef.current < 250) {
      return;
    }
    lastContextRecoveryAtRef.current = now;
    setLayoutEpoch((epoch) => epoch + 1);
  }, []);

  const requestHardRecovery = useCallback(() => {
    const now = Date.now();
    if (now - lastContextRecoveryAtRef.current < 250) {
      return;
    }
    lastContextRecoveryAtRef.current = now;
    setContextRecoveryKey((key) => key + 1);
    setLayoutEpoch((epoch) => epoch + 1);
  }, []);
  const handleTileResize = useCallback(() => {
    setLayoutEpoch((epoch) => epoch + 1);
  }, []);
  const canvasKey = `${variant}-${
    hasTransparentBackground ? "transparent" : "opaque"
  }-${contextRecoveryKey}`;
  const getInitialVisualReady = () =>
    variant === "tile" && projectArtifactTileHasRevealed;
  const [isVisualReady, setIsVisualReady] = useState(getInitialVisualReady);
  const [visualReadyVariant, setVisualReadyVariant] = useState(variant);

  if (visualReadyVariant !== variant) {
    setVisualReadyVariant(variant);
    setIsVisualReady(getInitialVisualReady());
  }

  useEffect(() => {
    const runtime = runtimeRef.current;
    runtime.imageIndex = initialImageIndex;
    runtime.clickPulse = 0;
    runtime.contentTransition = 1;
    runtime.isTransitioning = false;
    runtime.lastInteractionTime = Date.now();
  }, [initialImageIndex]);

  useEffect(() => {
    if (variant !== "tile" || gestureFreezeActive) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      requestSoftRecovery();
    });
    return () => cancelAnimationFrame(frame);
  }, [gestureFreezeActive, requestSoftRecovery, variant]);

  useEffect(() => {
    if (variant === "tile" && projectArtifactTileHasRevealed) {
      return;
    }

    const frameIds: number[] = [];
    let frame = 0;
    const frameDelay =
      variant === "tile"
        ? TILE_VISUAL_READY_FRAME_DELAY
        : VISUAL_READY_FRAME_DELAY;
    const tick = () => {
      frame += 1;
      if (frame >= frameDelay) {
        setIsVisualReady(true);
        if (variant === "tile") {
          projectArtifactTileHasRevealed = true;
        }
        return;
      }
      frameIds.push(requestAnimationFrame(tick));
    };
    frameIds.push(requestAnimationFrame(tick));

    return () => {
      frameIds.forEach(cancelAnimationFrame);
    };
  }, [variant]);

  const handleWebGLContextRestored = useCallback(() => {
    requestHardRecovery();
  }, [requestHardRecovery]);

  const updateCursorPosition = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    runtimeRef.current.cursorPosition = {
      x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
      y: -(((event.clientY - rect.top) / rect.height) * 2 - 1),
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    updateCursorPosition(event);
    if (interactive) recordInteraction(runtimeRef);
  };

  const handlePointerEnter = (event: ReactPointerEvent<HTMLDivElement>) => {
    updateCursorPosition(event);
    runtimeRef.current.isHovered = true;
    recordInteraction(runtimeRef);
  };

  const handlePointerLeave = () => {
    runtimeRef.current.isHovered = false;
    runtimeRef.current.isPointerDown = false;
    runtimeRef.current.isDragging = false;
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative isolate h-full w-full",
        variant === "tile"
          ? "pointer-events-none overflow-visible bg-transparent [transform:translateZ(0)]"
          : "overflow-hidden rounded-[28px] bg-transparent cursor-grab active:cursor-grabbing",
        className,
      )}
      onPointerEnter={interactive ? handlePointerEnter : undefined}
      onPointerLeave={interactive ? handlePointerLeave : undefined}
      onPointerMove={interactive ? handlePointerMove : undefined}
    >
      {variant === "tile" ? (
        <TileResizeRecovery
          containerRef={containerRef}
          onResize={handleTileResize}
        />
      ) : null}
      {variant === "preview" ? (
        <div
          className="pointer-events-none absolute inset-[8%] opacity-30 transition-colors duration-700 ease-out"
          style={{
            background: `radial-gradient(ellipse at center, ${state.accentColor} 0%, ${state.accentColor} 28%, transparent 66%)`,
          }}
        />
      ) : null}
      <div
        className={cn(
          "absolute inset-0 z-10",
          variant === "tile" ? "overflow-visible" : "rounded-[28px]",
          variant === "tile"
            ? projectArtifactTileHasRevealed
              ? "opacity-100"
              : cn(
                  "transition-opacity duration-200",
                  isVisualReady ? "opacity-100" : "opacity-0",
                )
            : cn(
                "ease-out transition-[filter,opacity] duration-300",
                isVisualReady ? "opacity-100 blur-0" : "opacity-0 blur-md",
              ),
        )}
      >
        <Canvas
          key={canvasKey}
          camera={getCanvasCamera(variant, cameraDistanceScale)}
          className={cn(
            "relative h-full w-full [transform:translateZ(0)]",
            variant === "tile" ? "overflow-visible" : "rounded-[28px]",
          )}
          dpr={[1, variant === "tile" ? 1.25 : 1.5]}
          frameloop={
            pauseRenderLoop || (variant === "tile" && gestureFreezeActive)
              ? "demand"
              : "always"
          }
          resize={{ offsetSize: true, debounce: 0 }}
          gl={{
            alpha: hasTransparentBackground,
            antialias: true,
            premultipliedAlpha: true,
            preserveDrawingBuffer: variant === "tile",
            powerPreference: "high-performance",
            stencil: false,
          }}
          style={{
            backgroundColor: hasTransparentBackground
              ? "transparent"
              : canvasBackground,
          }}
          onCreated={({ gl, scene }) => {
            gl.domElement.style.background = hasTransparentBackground
              ? "transparent"
              : canvasBackground;
            gl.setClearAlpha(hasTransparentBackground ? 0 : 1);
            gl.setClearColor(
              hasTransparentBackground ? "#000000" : canvasBackground,
              hasTransparentBackground ? 0 : 1,
            );
            scene.environmentIntensity = EFFECTS.envIntensity;
            onGlCanvasReady?.(gl.domElement);
          }}
        >
          <CanvasRenderSync
            layoutEpoch={layoutEpoch}
            onContextRestored={handleWebGLContextRestored}
            onNeedsRecovery={requestSoftRecovery}
          />
          <Suspense fallback={null}>
            <ArtifactScene
              environmentUrl={environmentUrl}
              imageUrls={imageUrls}
              motionImpulse={motionImpulse}
              runtimeRef={runtimeRef}
              state={state}
              variant={variant}
            />
          </Suspense>
        </Canvas>
      </div>
    </div>
  );
}

useGLTF.preload(PROJECT_ARTIFACT_CUBE_MODEL_URL);
