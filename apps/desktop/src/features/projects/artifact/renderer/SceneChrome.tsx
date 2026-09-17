import { type RefObject, useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import * as THREE from "three";
import { EFFECTS } from "./constants";

export function SceneBackground({
  color,
  transparent,
}: {
  color: string;
  transparent: boolean;
}) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    const clearColor = transparent ? "#000000" : color;
    scene.background = transparent ? null : new THREE.Color(color);
    gl.domElement.style.background = transparent ? "transparent" : color;
    gl.setClearColor(clearColor, transparent ? 0 : 1);
    gl.setClearAlpha(transparent ? 0 : 1);

    return () => {
      if (transparent) scene.background = null;
    };
  }, [color, gl, scene, transparent]);

  return null;
}

export function SceneEnvironment({ environmentUrl }: { environmentUrl: string }) {
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const scene = useThree((state) => state.scene);

  useFrame(() => {
    scene.environmentIntensity = EFFECTS.envIntensity;
    if (ambientRef.current) {
      ambientRef.current.intensity +=
        (0.4 - ambientRef.current.intensity) * 0.03;
      ambientRef.current.color.lerp(new THREE.Color("#f5f0eb"), 0.03);
    }
  });

  return (
    <>
      <ambientLight ref={ambientRef} intensity={0.4} color="#f5f0eb" />
      <Environment files={environmentUrl} background={false} />
    </>
  );
}

export function TransparentSceneRender() {
  useFrame(({ gl, scene, camera }) => {
    gl.render(scene, camera);
  }, 1);

  return null;
}

/** Keeps tile/preview canvases rendering after container resizes (home widget scaling). */
export function CanvasRenderSync({
  layoutEpoch = 0,
  onContextRestored,
  onNeedsRecovery,
}: {
  layoutEpoch?: number;
  onContextRestored?: () => void;
  onNeedsRecovery?: () => void;
}) {
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const size = useThree((state) => state.size);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-invalidate when widget layout or canvas size changes
  useEffect(() => {
    invalidate();
  }, [invalidate, layoutEpoch, size.height, size.width]);

  useEffect(() => {
    if (size.width > 0 && size.height > 0) {
      return;
    }

    const parent = gl.domElement.parentElement;
    if (!parent || parent.clientWidth <= 0 || parent.clientHeight <= 0) {
      return;
    }

    const timeout = window.setTimeout(() => {
      onNeedsRecovery?.();
    }, 120);

    return () => window.clearTimeout(timeout);
  }, [gl, onNeedsRecovery, size.height, size.width]);

  useEffect(() => {
    const canvas = gl.domElement;
    const handleContextLost = (event: Event) => {
      event.preventDefault();
    };
    const handleContextRestored = () => {
      invalidate();
      onContextRestored?.();
    };

    canvas.addEventListener("webglcontextlost", handleContextLost);
    canvas.addEventListener("webglcontextrestored", handleContextRestored);
    return () => {
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
    };
  }, [gl, invalidate, onContextRestored]);

  return null;
}

export function TileResizeRecovery({
  containerRef,
  onResize,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  onResize: () => void;
}) {
  useEffect(() => {
    const root = containerRef.current;
    if (!root) {
      return;
    }

    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (root.clientWidth > 0 && root.clientHeight > 0) {
          onResize();
        }
      });
    });
    observer.observe(root);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [containerRef, onResize]);

  return null;
}
