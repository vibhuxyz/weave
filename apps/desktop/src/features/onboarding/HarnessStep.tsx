import { IconCheck } from "@tabler/icons-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { getProviderIcon } from "@/shared/ui/icons/ProviderIcons";
import {
  ONBOARDING_ENGINES,
  engineProviderFallback,
} from "./catalog";
import { OnboardingShell } from "./OnboardingShell";

/** Each engine's mark is drawn at its own weight so the row reads evenly. */
const ENGINE_ICON_SIZES: Record<string, string> = {
  "claude-code": "size-[92px]",
  codex: "size-[94px]",
  gemini: "size-[92px]",
  amp: "size-[92px]",
  antigravity: "size-[90px]",
};

function EngineIcon({ id, className }: { id: string; className: string }) {
  // The registry id wins when it has a mark of its own; otherwise the engine's
  // provider does, which is how Gemini and Antigravity both reach Google's.
  return (
    getProviderIcon(id, className) ??
    getProviderIcon(engineProviderFallback(id), className)
  );
}

interface HarnessStepProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
}

export function HarnessStep({
  selectedId,
  onSelect,
  onBack,
  onNext,
  onSkip,
}: HarnessStepProps) {
  const reduceMotion = useReducedMotion();
  const { t } = useTranslation("onboarding");

  const selectRelativeEngine = (currentId: string, offset: number) => {
    const currentIndex = ONBOARDING_ENGINES.findIndex(
      (engine) => engine.id === currentId,
    );
    const nextIndex =
      (currentIndex + offset + ONBOARDING_ENGINES.length) %
      ONBOARDING_ENGINES.length;
    const nextId = ONBOARDING_ENGINES[nextIndex].id;
    onSelect(nextId);
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(`[data-engine-id="${nextId}"]`)
        ?.focus();
    });
  };

  return (
    <OnboardingShell
      onBack={onBack}
      title={t("harness.title")}
      description={t("harness.description")}
      actions={
        <>
          <Button type="button" onClick={onNext} disabled={!selectedId}>
            {t("harness.install")}
          </Button>
          <Button type="button" variant="outline" onClick={onSkip}>
            {t("harness.skip")}
          </Button>
        </>
      }
    >
      <div className="w-full overflow-x-auto">
        <div
          role="radiogroup"
          aria-label={t("harness.providerGroup")}
          className="mx-auto flex w-max min-w-full shrink-0 justify-around gap-8 px-8"
        >
          {ONBOARDING_ENGINES.map((engine, index) => {
            const selected = selectedId === engine.id;
            const muted = selectedId !== null && !selected;
            return (
              <motion.button
                key={engine.id}
                data-engine-id={engine.id}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={
                  selected || (selectedId === null && index === 0) ? 0 : -1
                }
                onClick={() => onSelect(engine.id)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                    event.preventDefault();
                    selectRelativeEngine(engine.id, 1);
                  } else if (
                    event.key === "ArrowLeft" ||
                    event.key === "ArrowUp"
                  ) {
                    event.preventDefault();
                    selectRelativeEngine(engine.id, -1);
                  }
                }}
                initial={reduceMotion ? false : { opacity: 0, y: 18 }}
                animate={{ opacity: muted ? 0.45 : 1, y: 0 }}
                transition={{
                  duration: reduceMotion ? 0 : 0.3,
                  delay: reduceMotion || selectedId !== null ? 0 : index * 0.08,
                }}
                className="flex w-[130px] flex-col items-center gap-5 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4"
              >
                <motion.span
                  animate={{ scale: selected ? 1.1 : 1 }}
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 360, damping: 24 }
                  }
                  className="flex size-[108px] items-center justify-center"
                >
                  <EngineIcon
                    id={engine.id}
                    className={ENGINE_ICON_SIZES[engine.id] ?? "size-[92px]"}
                  />
                </motion.span>
                <span className="flex h-9 min-w-[88px] items-center justify-center gap-1.5 rounded-full bg-card px-3 text-sm">
                  <AnimatePresence initial={false}>
                    {selected ? (
                      <motion.span
                        key="selected-check"
                        initial={
                          reduceMotion
                            ? false
                            : { opacity: 0, scale: 0.5, width: 0 }
                        }
                        animate={{ opacity: 1, scale: 1, width: 14 }}
                        exit={{ opacity: 0, scale: 0.5, width: 0 }}
                        transition={{
                          duration: reduceMotion ? 0 : 0.18,
                          ease: "easeOut",
                        }}
                        className="inline-flex shrink-0 items-center justify-center overflow-hidden"
                      >
                        <IconCheck
                          aria-hidden="true"
                          className="size-3.5 text-foreground"
                        />
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                  {engine.label}
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>
    </OnboardingShell>
  );
}

export { EngineIcon };
