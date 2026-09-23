import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react";
import { SplashBackdrop, SplashCenter } from "./scene";

const sceneVariants: Variants = {
  hidden: { opacity: 1 },
  show: { opacity: 1 },
  exit: { opacity: 0, transition: { duration: 0.55, delay: 0.15, ease: "easeInOut" } },
};

export interface StartupSplashProps {
  readonly isVisible: boolean;
  readonly message: string;
  readonly progress: number;
}

type SplashSceneProps = Omit<StartupSplashProps, "isVisible">;

function SplashScene({ message, progress }: SplashSceneProps) {
  const isAnimated = !useReducedMotion();

  return (
    <motion.div
      className="fixed inset-0 z-[2147483000] select-none overflow-hidden bg-canvas-base"
      initial="hidden"
      animate="show"
      exit="exit"
      variants={sceneVariants}
      aria-busy="true"
    >
      <SplashBackdrop isAnimated={isAnimated} />
      <SplashCenter message={message} progress={progress} isAnimated={isAnimated} />
    </motion.div>
  );
}

export function StartupSplash({ isVisible, ...sceneProps }: StartupSplashProps) {
  return <AnimatePresence>{isVisible && <SplashScene key="startup-splash" {...sceneProps} />}</AnimatePresence>;
}
