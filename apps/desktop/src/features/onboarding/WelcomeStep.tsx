import { useTranslation } from "react-i18next";
import { AgentAvatar } from "@/agents/AgentAvatar";
import { Button } from "@/shared/ui/button";
import { usePersistedState } from "@/shared/hooks/usePersistedState";

/**
 * The only onboarding step upstream Berd actually ships (its other 5 states
 * — work-types, recommendations, harness, harness-setup — exist as dead
 * code, confirmed by its own test). Ported as just this screen: a welcome
 * message, a telemetry opt-in, and one button into the app.
 */
export function WelcomeStep({ onComplete }: { onComplete: () => void }) {
  const { t } = useTranslation("onboarding");
  const [usageConsent, setUsageConsent] = usePersistedState<boolean>(
    "weave:telemetryConsent",
    true,
    (value, defaults) => (typeof value === "boolean" ? value : defaults),
  );

  return (
    <div
      data-app-shell-root="true"
      className="bg-dot-grid flex h-dvh flex-col items-center justify-center gap-6 text-foreground"
    >
      <AgentAvatar name="Weave" seed="weave" size="xl" />
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-2xl font-semibold">{t("welcome.title")}</h1>
        <p className="text-muted-foreground text-sm">{t("welcome.subtitle")}</p>
      </div>

      <Button type="button" size="lg" onClick={onComplete}>
        {t("welcome.getStarted")}
      </Button>

      <label className="flex max-w-xs items-start gap-2 text-center text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={usageConsent}
          onChange={(e) => setUsageConsent(e.target.checked)}
          className="mt-0.5"
        />
        {t("welcome.usageConsent")}
      </label>
    </div>
  );
}
