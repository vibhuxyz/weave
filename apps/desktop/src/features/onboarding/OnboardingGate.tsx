import type { ReactNode } from "react";
import { useOnboarding } from "./onboardingState";
import { OnboardingFlow } from "./OnboardingFlow";

/**
 * Ported from upstream `AppShell`'s onboarding branch: `if (lifecycle !==
 * "completed") return <OnboardingFlow/>`. There is no project-based gate
 * upstream — onboarding is the only thing checked before the app renders.
 *
 * The gate owns the onboarding state and hands the controller down. Calling
 * `useOnboarding` here *and* in the flow would give each its own `useState`
 * copy behind the same storage key, so finishing would advance the flow's copy
 * while the gate's stayed mid-onboarding — and the gate would keep rendering a
 * flow that now has nothing to show.
 */
export function OnboardingGate({ children }: { children: ReactNode }) {
  const onboarding = useOnboarding();

  if (!onboarding.completed) {
    return <OnboardingFlow onboarding={onboarding} />;
  }

  return <>{children}</>;
}
