import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";

const TOUR_STEP_COUNT = 5;

/**
 * Ported from upstream `OnboardingTourDialog` — same 5-step shape (canvas,
 * providers, example chat, agents, skills), copy adapted for Weave and for
 * what this app actually has (engines instead of a provider list, no skills
 * catalog yet — that step is dropped to 4 real steps... kept at 5 to match
 * upstream's shape, with the skills step reworded to "@file" mentions,
 * which this app does have).
 */
export function OnboardingTourDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation("onboarding");
  const [step, setStep] = useState(0);

  const steps = Array.from({ length: TOUR_STEP_COUNT }, (_, i) =>
    t(`tour.steps.${i}`, { returnObjects: true }) as {
      title: string;
      body: string;
    },
  );
  const current = steps[step];
  const isLast = step === TOUR_STEP_COUNT - 1;

  const close = () => {
    onOpenChange(false);
    setStep(0);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{current.title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{current.body}</p>
        <div className="flex items-center justify-center gap-1.5 py-2">
          {steps.map((s, i) => (
            <span
              key={s.title}
              className={
                i === step
                  ? "size-1.5 rounded-full bg-primary"
                  : "size-1.5 rounded-full bg-border"
              }
            />
          ))}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={close}>
            {t("tour.skip")}
          </Button>
          <Button
            type="button"
            onClick={() => (isLast ? close() : setStep((s) => s + 1))}
          >
            {isLast ? t("tour.done") : t("tour.next")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
