import { usePersistedState } from "@/shared/hooks/usePersistedState";

/**
 * First-run onboarding, adapted from upstream Berd's `onboardingStore`.
 * Upstream tracks a full lifecycle machine (welcome → work-types →
 * recommendations → harness → harness-setup → complete) and an installation
 * cohort so existing users skip the new landing page. Only the "welcome"
 * step is actually wired up there (confirmed by its own test), so this
 * ports just that: one boolean, persisted, defaulting to not-completed.
 */
const STORAGE_KEY = "weave:onboarding:v1";

function validate(value: unknown, defaults: boolean): boolean {
  return typeof value === "boolean" ? value : defaults;
}

export function useOnboardingCompleted() {
  return usePersistedState<boolean>(STORAGE_KEY, false, validate);
}
