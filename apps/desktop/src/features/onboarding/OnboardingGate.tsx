import type { ReactNode } from "react";
import { useOnboardingCompleted } from "./onboardingState";
import { WelcomeStep } from "./WelcomeStep";

/**
 * Ported from upstream `AppShell`'s onboarding branch: `if (lifecycle !==
 * "completed") return <OnboardingFlow/>`. There is no project-based gate
 * upstream — onboarding is the only thing checked before the app renders.
 */
export function OnboardingGate({ children }: { children: ReactNode }) {
  const [completed, setCompleted] = useOnboardingCompleted();

  if (!completed) {
    return <WelcomeStep onComplete={() => setCompleted(true)} />;
  }

  return <>{children}</>;
}
