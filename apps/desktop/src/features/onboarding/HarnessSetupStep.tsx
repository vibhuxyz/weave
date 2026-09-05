import { useEffect, useRef, useState } from "react";
import { IconCheck } from "@tabler/icons-react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { Spinner } from "@/shared/ui/spinner";
import { ONBOARDING_ENGINES } from "./catalog";
import { EngineIcon } from "./HarnessStep";
import { OnboardingShell } from "./OnboardingShell";

interface HarnessSetupStepProps {
  engineId: string;
  /** True when this engine was already installed in an earlier visit. */
  initiallyComplete: boolean;
  onBack: () => void;
  onInstalled: (engineId: string) => void;
  onComplete: () => void;
  onSkip: () => void;
}

/**
 * Installs the chosen engine and reports the outcome. Upstream drives a
 * provider card that polls readiness over ACP; this app installs through the
 * `install_engine` Tauri command, so the step owns the whole lifecycle — one
 * install per visit, guarded so React's development double-effect cannot fire
 * two npm installs at once.
 */
export function HarnessSetupStep({
  engineId,
  initiallyComplete,
  onBack,
  onInstalled,
  onComplete,
  onSkip,
}: HarnessSetupStepProps) {
  const { t } = useTranslation("onboarding");
  const engine = ONBOARDING_ENGINES.find((item) => item.id === engineId);
  const [complete, setComplete] = useState(initiallyComplete);
  const [error, setError] = useState<string | null>(null);
  const installPromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (!engine || initiallyComplete) return;
    
    if (!installPromiseRef.current) {
      installPromiseRef.current = invoke("install_engine", { packageName: engine.packageName });
    }
    
    let cancelled = false;

    installPromiseRef.current
      .then(() => {
        if (cancelled) return;
        setComplete(true);
        onInstalled(engine.id);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      });

    return () => {
      cancelled = true;
    };
  }, [engine, initiallyComplete, onInstalled]);

  if (!engine) {
    return null;
  }

  if (complete) {
    return (
      <OnboardingShell
        onBack={onBack}
        title={t("setup.readyTitle", { provider: engine.label })}
        description={t("setup.readyDescription")}
        actions={
          <Button type="button" onClick={onComplete}>
            {t("setup.finishOnboarding")}
          </Button>
        }
      >
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="flex size-28 items-center justify-center rounded-full bg-card">
            <EngineIcon id={engine.id} className="size-16" />
          </div>
          <div className="flex items-center gap-2 text-foreground">
            <IconCheck className="size-5" aria-hidden="true" />
            <span className="text-sm">{t("setup.installationComplete")}</span>
          </div>
        </div>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell
      onBack={onBack}
      title={
        <span className="inline-flex items-center gap-3">
          {t("setup.installing")}{" "}
          <EngineIcon id={engine.id} className="size-9" /> {engine.label}
        </span>
      }
      description={t("setup.installingDescription", { provider: engine.label })}
      actions={
        <>
          <Button type="button" disabled>
            {t("setup.finish")}
          </Button>
          <Button type="button" variant="outline" onClick={onSkip}>
            {t("setup.skip")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="flex size-28 items-center justify-center rounded-full bg-card">
          <EngineIcon id={engine.id} className="size-16" />
        </div>
        {error ? (
          <p role="alert" className="max-w-sm text-xs text-destructive">
            {error}
          </p>
        ) : (
          <Spinner className="size-5 text-muted-foreground" />
        )}
      </div>
    </OnboardingShell>
  );
}
