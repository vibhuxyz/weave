import { cn } from "@/shared/lib";

const VIEWBOX_SIZE = 20;
const STROKE_WIDTH = 3;
const RADIUS = (VIEWBOX_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const CENTER = VIEWBOX_SIZE / 2;

interface ContextRingProps {
  readonly ratio: number;
  readonly isOverThreshold: boolean;
}

export function ContextRing({ ratio, isOverThreshold }: ContextRingProps) {
  return (
    <svg viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`} className="size-5 -rotate-90" aria-hidden="true">
      <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" strokeWidth={STROKE_WIDTH} className="stroke-foreground/25" />
      <circle
        cx={CENTER}
        cy={CENTER}
        r={RADIUS}
        fill="none"
        strokeWidth={STROKE_WIDTH}
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={CIRCUMFERENCE * (1 - ratio)}
        className={cn(
          "transition-[stroke-dashoffset] duration-300 motion-reduce:transition-none",
          isOverThreshold ? "stroke-destructive" : "stroke-foreground",
        )}
      />
    </svg>
  );
}
