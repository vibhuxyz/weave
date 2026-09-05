import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AgentAvatar } from "@/agents/AgentAvatar";
import { Button } from "@/shared/ui/button";
import { usePersistedState } from "@/shared/hooks/usePersistedState";
import { OnboardingTourDialog } from "./OnboardingTourDialog";

/**
 * Ported from upstream `OnboardingTourWidget` ("Berdy"). Upstream is a
 * canvas widget seeded onto Home; the canvas here is Phase 1 (clock +
 * agentPin only — no sticky-note/label widget types yet), so this ships as a
 * fixed overlay instead of a new catalog entry. Same behavior: greets once,
 * dismissible, opens the tour dialog. No named mascot — Weave speaks as
 * itself, per the "I'm Weave" framing chosen over inventing a character.
 */
export function GreeterWidget() {
  const { t } = useTranslation("onboarding");
  const [dismissed, setDismissed] = usePersistedState<boolean>(
    "weave:greeterDismissed",
    false,
    (value, defaults) => (typeof value === "boolean" ? value : defaults),
  );
  const [tourOpen, setTourOpen] = useState(false);

  if (dismissed) return null;

  return (
    <>
      <div className="pointer-events-none absolute bottom-6 right-6 z-20 flex max-w-xs items-end gap-3">
        <div className="pointer-events-auto rounded-2xl border border-border bg-card p-4 shadow-lg">
          <div className="mb-2 flex items-center gap-2">
            <AgentAvatar name="Weave" seed="weave" size="sm" />
            <span className="text-sm font-medium">{t("greeter.title")}</span>
            <button
              type="button"
              aria-label={t("greeter.dismiss")}
              onClick={() => setDismissed(true)}
              className="ml-auto text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          </div>
          <p className="mb-3 text-sm text-muted-foreground">{t("greeter.body")}</p>
          <Button
            type="button"
            size="sm"
            onClick={() => setTourOpen(true)}
          >
            {t("greeter.action")}
          </Button>
        </div>
      </div>
      <OnboardingTourDialog
        open={tourOpen}
        onOpenChange={(next) => {
          setTourOpen(next);
          if (!next) setDismissed(true);
        }}
      />
    </>
  );
}
