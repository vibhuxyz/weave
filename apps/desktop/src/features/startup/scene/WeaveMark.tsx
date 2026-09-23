import { motion } from "motion/react";
import { cn } from "@/shared/lib";

const WARP_OFFSETS = ["left-[18%]", "left-[43%]", "left-[68%]"] as const;

const WEFTS = [
  { top: "top-[18%]", gradient: "from-splash-indigo via-splash-violet to-splash-fuchsia", layer: "z-30", direction: 1 },
  { top: "top-[43%]", gradient: "from-splash-pink via-splash-rose to-splash-amber", layer: "z-10", direction: -1 },
  { top: "top-[68%]", gradient: "from-splash-sky-soft via-splash-cyan to-splash-indigo", layer: "z-30", direction: 1 },
] as const;

const WEFT_LOOP_SECONDS = 3.2;
const WEFT_STAGGER_SECONDS = 0.18;

interface WeaveMarkProps {
  className?: string;
  isAnimated: boolean;
}

export function WeaveMark({ className, isAnimated }: WeaveMarkProps) {
  return (
    <div className={cn("relative aspect-square", className)} aria-hidden="true">
      {WARP_OFFSETS.map((offset) => (
        <span
          key={offset}
          className={cn(
            "absolute top-0 z-20 h-full w-[14%] rounded-full border-2 border-gray-600/90 bg-zinc-950/80",
            offset,
          )}
        />
      ))}
      {WEFTS.map((weft, index) => (
        <motion.span
          key={weft.top}
          className={cn(
            "absolute left-0 h-[14%] w-full rounded-full bg-gradient-to-r shadow-lg shadow-splash-violet/40",
            weft.top,
            weft.gradient,
            weft.layer,
          )}
          initial={{ x: `${-weft.direction * 60}%`, scaleX: 0.3, opacity: 0 }}
          animate={
            isAnimated
              ? { x: ["-2%", "2%", "-2%"], scaleX: 1, opacity: 1 }
              : { x: "0%", scaleX: 1, opacity: 1 }
          }
          transition={{
            opacity: { duration: 0.5, delay: 0.2 + index * WEFT_STAGGER_SECONDS },
            scaleX: { type: "spring", stiffness: 120, damping: 16, delay: 0.2 + index * WEFT_STAGGER_SECONDS },
            x: isAnimated
              ? { duration: WEFT_LOOP_SECONDS, repeat: Infinity, ease: "easeInOut", delay: index * WEFT_STAGGER_SECONDS }
              : { duration: 0.6 },
          }}
        />
      ))}
    </div>
  );
}
