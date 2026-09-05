import { HarnessSetupStep } from "./HarnessSetupStep";
import { HarnessStep } from "./HarnessStep";
import type { useOnboarding } from "./onboardingState";
import { RecommendationsStep } from "./RecommendationsStep";
import { WelcomeStep } from "./WelcomeStep";
import { WorkTypesStep } from "./WorkTypesStep";
import type { WorkTypeId } from "./catalog";

/**
 * The first-run ceremony: welcome → work types → recommended agents → engine →
 * install → done. Upstream Berd ships all six screens but wires only the
 * welcome page into its flow, jumping straight to complete; this runs the
 * whole sequence.
 *
 * Every step after the welcome can be skipped, and skipping lands on the same
 * place finishing does — nothing here is a gate on using the app.
 */
export function OnboardingFlow({
  onboarding,
}: {
  onboarding: ReturnType<typeof useOnboarding>;
}) {
  const {
    state,
    next,
    back,
    goTo,
    complete,
    toggleWorkType,
    keepAgents,
    selectEngine,
    markEngineInstalled,
    setShareUsageData,
  } = onboarding;

  const finish = complete;

  switch (state.step) {
    case "welcome":
      return (
        <WelcomeStep
          shareUsageData={state.shareUsageData}
          onShareUsageDataChange={setShareUsageData}
          onComplete={next}
        />
      );

    case "work-types":
      return (
        <WorkTypesStep
          selectedIds={state.selectedWorkTypeIds}
          onToggle={(id: WorkTypeId) => toggleWorkType(id)}
          onBack={back}
          onNext={next}
        />
      );

    case "recommendations":
      return (
        <RecommendationsStep
          selectedWorkTypeIds={state.selectedWorkTypeIds}
          onBack={back}
          onKeep={(agentIds) => {
            keepAgents(agentIds);
            next();
          }}
          onSkip={next}
        />
      );

    case "harness":
      return (
        <HarnessStep
          selectedId={state.selectedEngineId}
          onSelect={selectEngine}
          onBack={back}
          onNext={next}
          onSkip={finish}
        />
      );

    case "harness-setup":
      // Reachable only with an engine chosen; a stale persisted step without
      // one falls back to the picker rather than rendering nothing.
      return state.selectedEngineId ? (
        <HarnessSetupStep
          engineId={state.selectedEngineId}
          initiallyComplete={state.installedEngineIds.includes(
            state.selectedEngineId,
          )}
          onBack={back}
          onInstalled={markEngineInstalled}
          onComplete={finish}
          onSkip={finish}
        />
      ) : (
        <HarnessStep
          selectedId={null}
          onSelect={selectEngine}
          onBack={() => goTo("recommendations")}
          onNext={next}
          onSkip={finish}
        />
      );

    case "complete":
      return null;
  }
}
