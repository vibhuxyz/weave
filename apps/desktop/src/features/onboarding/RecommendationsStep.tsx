import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/cn";
import { AgentAvatar } from "@/agents/AgentAvatar";
import { useAgents, type Agent } from "@/useAgents";
import { recommendationsForWorkTypes } from "./catalog";
import { OnboardingShell } from "./OnboardingShell";

function AgentChoice({
  agent,
  expanded,
  onToggle,
}: {
  agent: Agent;
  expanded: boolean;
  onToggle: () => void;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="flex h-[clamp(368px,50vh,508px)] w-[clamp(280px,28vw,380px)] min-w-[280px] flex-none flex-col items-center focus-visible:outline-2 focus-visible:outline-offset-4"
    >
      <div className="relative flex max-h-[360px] min-h-[220px] w-full flex-1 items-end justify-center overflow-hidden">
        <AgentAvatar
          name={agent.name}
          seed={agent.id}
          size="lg"
          className="absolute inset-0 h-full w-full object-contain object-bottom"
        />
      </div>
      <div
        className={cn(
          "relative mt-5 flex h-fit shrink-0 flex-col overflow-hidden rounded-[18px] bg-card text-sm",
          reduceMotion
            ? "transition-none"
            : "transition-[width] duration-300 ease-out",
          expanded ? "w-[250px]" : "w-[96px]",
        )}
      >
        <div className="flex h-9 shrink-0 items-center justify-center px-3">
          <span className="truncate">{agent.name}</span>
        </div>
        <AnimatePresence initial={false}>
          {expanded ? (
            <motion.div
              initial={reduceMotion ? false : { height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.2 }}
              className="mx-auto -mt-1 w-[218px] px-4 pb-3 text-center text-muted-foreground"
            >
              {agent.description}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </button>
  );
}

interface RecommendationsStepProps {
  selectedWorkTypeIds: readonly string[];
  onBack: () => void;
  onKeep: (agentIds: string[]) => void;
  onSkip: () => void;
}

/**
 * Introduces three of the built-in agents, picked from the work the user just
 * chose. Upstream creates brand-new personas over ACP here and so has to wait
 * on the chat runtime; these agents already exist in `useAgents`, so keeping
 * them only records the choice and the step never blocks on startup.
 */
export function RecommendationsStep({
  selectedWorkTypeIds,
  onBack,
  onKeep,
  onSkip,
}: RecommendationsStepProps) {
  const { t } = useTranslation("onboarding");
  const { agents } = useAgents();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const recommended = recommendationsForWorkTypes(selectedWorkTypeIds).flatMap(
    (recommendation) => {
      const agent = agents.find((item) => item.id === recommendation.id);
      return agent ? [agent] : [];
    },
  );

  return (
    <OnboardingShell
      onBack={onBack}
      title={t("recommendations.title")}
      description={t("recommendations.description")}
      actions={
        <>
          <Button
            type="button"
            onClick={() => onKeep(recommended.map((agent) => agent.id))}
          >
            {t("recommendations.keep")}
          </Button>
          <Button type="button" variant="outline" onClick={onSkip}>
            {t("recommendations.skip")}
          </Button>
        </>
      }
    >
      <div className="w-full overflow-x-auto">
        <div className="mx-auto flex w-max min-w-full items-start justify-center gap-[clamp(24px,4vw,48px)] px-10">
          {recommended.map((agent) => (
            <AgentChoice
              key={agent.id}
              agent={agent}
              expanded={expandedId === agent.id}
              onToggle={() =>
                setExpandedId((current) =>
                  current === agent.id ? null : agent.id,
                )
              }
            />
          ))}
        </div>
      </div>
    </OnboardingShell>
  );
}
