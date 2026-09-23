import { useEffect, type RefObject } from "react";
import { EDGE_MARGIN_PX, FIELD_COLOR_TOKENS, STILL_FRAME_SECONDS } from "./constants";
import { drawField } from "./draw-field";
import { buildLattice, type FieldLattice } from "./lattice";
import { wanderCenter } from "./wander";

interface CanvasSize {
  readonly widthPx: number;
  readonly heightPx: number;
}

function readThemeColors(): string[] {
  const styles = getComputedStyle(document.documentElement);
  return FIELD_COLOR_TOKENS.map((token) => styles.getPropertyValue(token).trim()).filter(Boolean);
}

function fitCanvas(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D): CanvasSize {
  const pixelRatio = window.devicePixelRatio || 1;
  const widthPx = canvas.clientWidth;
  const heightPx = canvas.clientHeight;
  canvas.width = Math.round(widthPx * pixelRatio);
  canvas.height = Math.round(heightPx * pixelRatio);
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  return { widthPx, heightPx };
}

function latticeFor(size: CanvasSize): FieldLattice {
  return buildLattice(Math.hypot(size.widthPx, size.heightPx) / 2 + EDGE_MARGIN_PX);
}

export function useParticleField(canvasRef: RefObject<HTMLCanvasElement | null>, isAnimated: boolean): void {
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const colors = readThemeColors();
    let size = fitCanvas(canvas, context);
    let lattice = latticeFor(size);
    let frameId = 0;
    const startedAt = performance.now();

    const render = (timeSeconds: number) => {
      const center = wanderCenter(timeSeconds, size.widthPx, size.heightPx);
      drawField(context, lattice, { timeSeconds, centerX: center.x, centerY: center.y, ...size, colors });
    };

    const loop = (now: number) => {
      render((now - startedAt) / 1000);
      frameId = requestAnimationFrame(loop);
    };

    const observer = new ResizeObserver(() => {
      size = fitCanvas(canvas, context);
      lattice = latticeFor(size);
      if (!isAnimated) render(STILL_FRAME_SECONDS);
    });
    observer.observe(canvas);

    if (isAnimated) frameId = requestAnimationFrame(loop);
    else render(STILL_FRAME_SECONDS);

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [canvasRef, isAnimated]);
}
