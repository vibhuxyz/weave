import { type MutableRefObject, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";

export function useMemoryTextures(imageUrls: string[]) {
  const textures = useTexture(imageUrls);
  const textureArray = useMemo(
    () => (Array.isArray(textures) ? textures : [textures]),
    [textures],
  );

  useEffect(() => {
    textureArray.forEach((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearFilter;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.needsUpdate = true;
    });
  }, [textureArray]);

  return textureArray;
}

export function useMorphedAccentColor(accentColor: string) {
  const colorRef = useRef(new THREE.Color(accentColor));
  const targetRef = useRef(new THREE.Color(accentColor));

  useEffect(() => {
    targetRef.current.set(accentColor);
  }, [accentColor]);

  useFrame((_, delta) => {
    colorRef.current.lerp(targetRef.current, 1 - Math.exp(-delta * 5.4));
  });

  return colorRef;
}

export function useGlassTint(accentColorRef: MutableRefObject<THREE.Color>) {
  const tintRef = useRef(new THREE.Color("#ffffff"));

  useFrame(() => {
    tintRef.current.set("#ffffff").lerp(accentColorRef.current, 0.5);
  });

  return tintRef;
}

export function useStrictModeSafeDisposal<T>(
  resource: T,
  dispose: (resource: T) => void,
) {
  const pendingDisposalRef = useRef<{
    resource: T;
    timeoutId: number;
  } | null>(null);

  useEffect(() => {
    const pendingDisposal = pendingDisposalRef.current;
    if (pendingDisposal?.resource === resource) {
      window.clearTimeout(pendingDisposal.timeoutId);
      pendingDisposalRef.current = null;
    }

    return () => {
      const timeoutId = window.setTimeout(() => {
        if (pendingDisposalRef.current?.resource === resource) {
          pendingDisposalRef.current = null;
        }
        dispose(resource);
      }, 0);
      pendingDisposalRef.current = { resource, timeoutId };
    };
  }, [dispose, resource]);
}

export function disposeThreeResource(resource: { dispose: () => void }) {
  resource.dispose();
}
