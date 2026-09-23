import { useRef } from "react";
import { useParticleField } from "./use-particle-field";

interface ParticleFieldProps {
  isAnimated: boolean;
}

export function ParticleField({ isAnimated }: ParticleFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useParticleField(canvasRef, isAnimated);
  return <canvas ref={canvasRef} className="absolute inset-0 size-full" aria-hidden="true" />;
}
