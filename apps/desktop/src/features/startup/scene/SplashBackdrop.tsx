import { motion } from "motion/react";
import { ParticleField } from "./particles";

interface SplashBackdropProps {
  isAnimated: boolean;
}

export function SplashBackdrop({ isAnimated }: SplashBackdropProps) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="bg-dot-grid absolute inset-0" />
      <ParticleField isAnimated={isAnimated} />
      <motion.div
        className="absolute left-1/2 top-1/2 size-[min(56vw,640px)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-splash-violet-deep/15 blur-3xl"
        initial={{ opacity: 0, scale: 0.6 }}
        animate={isAnimated ? { opacity: [0.7, 1, 0.7], scale: [0.95, 1.05, 0.95] } : { opacity: 0.85, scale: 1 }}
        transition={{ duration: 6, repeat: isAnimated ? Infinity : 0, ease: "easeInOut" }}
      />
    </div>
  );
}
