import { motion } from "motion/react";
import { WeaveMark } from "./WeaveMark";

interface SplashCenterProps {
  message: string;
  progress: number;
  isAnimated: boolean;
}

function StartupProgress({ progress, isAnimated }: { progress: number; isAnimated: boolean }) {
  return (
    <div className="relative h-1 w-40 overflow-hidden rounded-full bg-white/10">
      <motion.div
        className="absolute inset-0 origin-left rounded-full bg-gradient-to-r from-splash-indigo via-splash-violet to-splash-fuchsia"
        initial={{ scaleX: 0.05 }}
        animate={{ scaleX: progress }}
        transition={{ type: "spring", stiffness: 60, damping: 18 }}
      />
      {isAnimated && (
        <motion.div
          className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/50 to-transparent"
          initial={{ x: "-100%" }}
          animate={{ x: "320%" }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut", repeatDelay: 0.3 }}
        />
      )}
    </div>
  );
}

export function SplashCenter({ message, progress, isAnimated }: SplashCenterProps) {
  return (
    <motion.div
      className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-10"
      variants={{ exit: { opacity: 0, scale: 1.12, transition: { duration: 0.45 } } }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.6, rotate: -12 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 110, damping: 14 }}
      >
        <WeaveMark className="w-[clamp(88px,9vw,132px)]" isAnimated={isAnimated} />
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.6 }}>
        <StartupProgress progress={progress} isAnimated={isAnimated} />
      </motion.div>
      <p className="sr-only" role="status" aria-live="polite">
        {message}
      </p>
    </motion.div>
  );
}
