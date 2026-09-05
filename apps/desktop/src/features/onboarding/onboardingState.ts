import { useCallback, useMemo } from "react";
import { usePersistedState } from "@/shared/hooks/usePersistedState";

export const ONBOARDING_STEPS = [
  "welcome",
  "work-types",
  "recommendations",
  "harness",
  "harness-setup",
  "complete",
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export interface OnboardingState {
  step: OnboardingStep;
  selectedWorkTypeIds: string[];
  keptAgentIds: string[];
  selectedEngineId: string | null;
  installedEngineIds: string[];
  shareUsageData: boolean;
}

export const INITIAL_ONBOARDING_STATE: OnboardingState = {
  step: "welcome",
  selectedWorkTypeIds: [],
  keptAgentIds: [],
  selectedEngineId: null,
  installedEngineIds: [],
  shareUsageData: true,
};

/**
 * First-run onboarding. Upstream Berd keeps a `lifecycle` field beside `step`,
 * but the two can only ever disagree — `complete` is the completed lifecycle —
 * so this tracks the step alone and derives the rest.
 */
const STORAGE_KEY = "weave:onboarding:v2";

function stepAtOffset(step: OnboardingStep, offset: number): OnboardingStep {
  const index = ONBOARDING_STEPS.indexOf(step);
  const nextIndex = Math.max(
    0,
    Math.min(ONBOARDING_STEPS.length - 1, index + offset),
  );
  return ONBOARDING_STEPS[nextIndex];
}

function isStep(value: unknown): value is OnboardingStep {
  return (
    typeof value === "string" &&
    (ONBOARDING_STEPS as readonly string[]).includes(value)
  );
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function validate(value: unknown, defaults: OnboardingState): OnboardingState {
  if (!value || typeof value !== "object") return defaults;
  const stored = value as Partial<OnboardingState>;
  return {
    step: isStep(stored.step) ? stored.step : defaults.step,
    selectedWorkTypeIds: stringArray(stored.selectedWorkTypeIds),
    keptAgentIds: stringArray(stored.keptAgentIds),
    selectedEngineId:
      typeof stored.selectedEngineId === "string"
        ? stored.selectedEngineId
        : null,
    installedEngineIds: stringArray(stored.installedEngineIds),
    shareUsageData:
      typeof stored.shareUsageData === "boolean"
        ? stored.shareUsageData
        : defaults.shareUsageData,
  };
}

export function useOnboarding() {
  const [state, setState] = usePersistedState<OnboardingState>(
    STORAGE_KEY,
    INITIAL_ONBOARDING_STATE,
    validate,
  );

  const next = useCallback(
    () => setState((s) => ({ ...s, step: stepAtOffset(s.step, 1) })),
    [setState],
  );

  const back = useCallback(
    () => setState((s) => ({ ...s, step: stepAtOffset(s.step, -1) })),
    [setState],
  );

  const goTo = useCallback(
    (step: OnboardingStep) => setState((s) => ({ ...s, step })),
    [setState],
  );

  const complete = useCallback(
    () => setState((s) => ({ ...s, step: "complete" })),
    [setState],
  );

  const replay = useCallback(
    () =>
      setState((s) => ({
        ...INITIAL_ONBOARDING_STATE,
        // Replaying resets the presentation, not durable outcomes: an engine
        // installed during onboarding stays installed, and a consent answer
        // already given stays answered.
        installedEngineIds: s.installedEngineIds,
        shareUsageData: s.shareUsageData,
      })),
    [setState],
  );

  const toggleWorkType = useCallback(
    (workTypeId: string) =>
      setState((s) => ({
        ...s,
        selectedWorkTypeIds: s.selectedWorkTypeIds.includes(workTypeId)
          ? s.selectedWorkTypeIds.filter((id) => id !== workTypeId)
          : [...s.selectedWorkTypeIds, workTypeId],
      })),
    [setState],
  );

  const keepAgents = useCallback(
    (agentIds: string[]) =>
      setState((s) => ({ ...s, keptAgentIds: [...new Set(agentIds)] })),
    [setState],
  );

  const selectEngine = useCallback(
    (engineId: string | null) =>
      setState((s) => ({ ...s, selectedEngineId: engineId })),
    [setState],
  );

  const markEngineInstalled = useCallback(
    (engineId: string) =>
      setState((s) => ({
        ...s,
        installedEngineIds: [...new Set([...s.installedEngineIds, engineId])],
      })),
    [setState],
  );

  const setShareUsageData = useCallback(
    (shareUsageData: boolean) => setState((s) => ({ ...s, shareUsageData })),
    [setState],
  );

  const completed = state.step === "complete";

  return useMemo(
    () => ({
      state,
      completed,
      next,
      back,
      goTo,
      complete,
      replay,
      toggleWorkType,
      keepAgents,
      selectEngine,
      markEngineInstalled,
      setShareUsageData,
    }),
    [
      state,
      completed,
      next,
      back,
      goTo,
      complete,
      replay,
      toggleWorkType,
      keepAgents,
      selectEngine,
      markEngineInstalled,
      setShareUsageData,
    ],
  );
}
