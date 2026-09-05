import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { ProjectArtifactPreview } from "@/features/projects/artifact/ProjectArtifactPreview";
import type { ProjectArtifactMotionImpulse } from "@/features/projects/artifact/types";
import { UsageDataDialog } from "@/features/settings/ui/UsageDataDialog";
import { OnboardingShell } from "./OnboardingShell";

/**
 * The only onboarding step upstream Berd actually ships (its other 5 states
 * — work-types, recommendations, harness, harness-setup — exist as dead
 * code, confirmed by its own test). The layout is ported as-is: the glass
 * cube bleeding off the left edge, the headline block on the right.
 *
 * Consent differs from upstream on purpose. Berd writes to a Rust-owned
 * setting gated on a profile capability; there is no such setting here, so
 * the answer rides along in the onboarding state, defaulting to ON the same
 * way the upstream landing page does.
 */

const reveal = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function WelcomeStep({
  shareUsageData,
  onShareUsageDataChange,
  onComplete,
}: {
  shareUsageData: boolean;
  onShareUsageDataChange: (shareUsageData: boolean) => void;
  onComplete: () => void;
}) {
  const { t } = useTranslation("onboarding");
  const reduceMotion = useReducedMotion() === true;
  const checkboxId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [cubeMotion, setCubeMotion] = useState<ProjectArtifactMotionImpulse>();
  const lastPointer = useRef<{ x: number; y: number; time: number } | null>(
    null,
  );

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const updateCubeMotion = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const current = {
      x: event.clientX,
      y: event.clientY,
      time: event.timeStamp,
    };
    const previous = lastPointer.current;
    lastPointer.current = current;
    const elapsed = Math.max(current.time - (previous?.time ?? current.time), 8);
    const deltaX = previous ? (current.x - previous.x) / rect.width : 0;
    const deltaY = previous ? (current.y - previous.y) / rect.height : 0;
    const velocityBoost = clamp(
      1 + (Math.hypot(deltaX, deltaY) / (elapsed / 1000)) * 0.22,
      0.9,
      3.1,
    );
    // Only the pointer *velocity* is sent. The renderer converts it to spin
    // and tracks the hover lean itself from its own canvas pointer events —
    // upstream also passes hoverX/hoverY here, which nothing ever reads.
    setCubeMotion((motion) => ({
      sequence: (motion?.sequence ?? 0) + 1,
      deltaX: clamp(deltaX * velocityBoost, -0.3, 0.3),
      deltaY: clamp(deltaY * velocityBoost, -0.3, 0.3),
    }));
  };

  const resetCubeMotion = () => {
    lastPointer.current = null;
    setCubeMotion((motion) =>
      motion
        ? {
            ...motion,
            sequence: motion.sequence + 1,
            deltaX: 0,
            deltaY: 0,
          }
        : motion,
    );
  };

  return (
    <OnboardingShell contentClassName="max-[760px]:overflow-x-hidden max-[760px]:overflow-y-auto">
      <motion.div
        className="relative grid h-full w-full grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] items-center gap-[clamp(3rem,8vw,10rem)] px-[clamp(0rem,4vw,5rem)] pt-[var(--spacing-app-top-bar)] max-[760px]:grid-cols-1 max-[760px]:gap-0 max-[760px]:px-8"
        initial="hidden"
        animate="visible"
        transition={{ staggerChildren: reduceMotion ? 0 : 0.12 }}
      >
        <motion.div
          variants={reveal}
          transition={{ duration: reduceMotion ? 0 : 0.35 }}
          className="flex h-[min(92vh,980px)] w-[min(62vw,980px)] translate-x-16 items-center justify-self-end overflow-visible max-[760px]:absolute max-[760px]:bottom-[calc(-18vh-80px)] max-[760px]:left-1/2 max-[760px]:h-[62vh] max-[760px]:w-full max-[760px]:-translate-x-1/2 max-[760px]:justify-center"
          aria-hidden="true"
          onPointerEnter={reduceMotion ? undefined : updateCubeMotion}
          onPointerMove={reduceMotion ? undefined : updateCubeMotion}
          onPointerLeave={reduceMotion ? undefined : resetCubeMotion}
        >
          <div className="h-[120%] w-[120%] shrink-0 -translate-x-64 scale-[1.0875] max-[760px]:h-[145%] max-[760px]:w-[145%] max-[760px]:translate-x-0 max-[760px]:translate-y-12 max-[760px]:scale-[1.15]">
            <ProjectArtifactPreview
              input={{
                projectId: "weave-welcome",
                name: "Welcome to Weave",
                color: "olive",
                artifact: {
                  seed: 18,
                  color: "olive",
                  mood: "serene",
                  moodIntensity: 0.72,
                  contentMode: "cube",
                },
              }}
              variant="tile"
              cameraDistanceScale={1.2}
              motionImpulse={reduceMotion ? undefined : cubeMotion}
              gestureFreezeActive={reduceMotion}
              className="h-full w-full"
            />
          </div>
        </motion.div>

        <motion.section
          variants={reveal}
          transition={{ duration: reduceMotion ? 0 : 0.35 }}
          className="w-full max-w-[390px] justify-self-start max-[760px]:absolute max-[760px]:top-[42%] max-[760px]:left-1/2 max-[760px]:-translate-x-1/2 max-[760px]:-translate-y-1/2 max-[760px]:text-center"
        >
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-[clamp(2.25rem,3.2vw,3.5rem)] leading-[0.98] font-normal tracking-[-0.045em] text-foreground outline-none"
          >
            {t("welcome.title")}
            <br />
            {t("welcome.subtitle")}
          </h1>

          <Button
            type="button"
            size="lg"
            className="mt-9 w-[calc(100%-80px)] max-[760px]:mx-auto"
            onClick={onComplete}
          >
            {t("welcome.getStarted")}
          </Button>

          <div className="mt-6 flex w-[calc(100%-72px)] items-start gap-2.5 text-left text-xs leading-[1.15] text-muted-foreground max-[760px]:mx-auto">
            <Checkbox
              id={checkboxId}
              checked={shareUsageData}
              onCheckedChange={(checked) => onShareUsageDataChange(checked === true)}
              aria-describedby={`${checkboxId}-description`}
            />
            <p id={`${checkboxId}-description`}>
              <label htmlFor={checkboxId}>{t("welcome.usageConsent")}</label>{" "}
              <Button
                type="button"
                variant="link"
                className="text-xs"
                onClick={() => setDetailsOpen(true)}
              >
                {t("welcome.learnMore")}
              </Button>
            </p>
          </div>
        </motion.section>
      </motion.div>

      <UsageDataDialog open={detailsOpen} onOpenChange={setDetailsOpen} />
    </OnboardingShell>
  );
}
