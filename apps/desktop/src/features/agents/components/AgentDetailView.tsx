import type { ReactNode } from "react";
import { motion } from "motion/react";
import { ENGINES } from "@weave/agent/browser";
import { MessageResponse } from "@/shared/ui/ai-elements";
import type { Agent } from "@/features/agents/hooks";
import { AgentAvatar } from "./AgentAvatar";
import { AgentDetailHeader, type AgentDetailHeaderProps } from "./AgentDetailHeader";
import { AgentQuickComposer } from "./AgentQuickComposer";

const DEFAULT_LABEL = "Default";

function providerLabel(engineId: string | undefined): string {
  if (!engineId) return DEFAULT_LABEL;
  return ENGINES[engineId]?.label ?? engineId;
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm leading-relaxed text-foreground">{children}</div>
    </div>
  );
}

export interface AgentDetailViewProps extends Omit<AgentDetailHeaderProps, "name" | "onChat"> {
  agent: Agent;
  onChat: (message?: string) => void;
}

export function AgentDetailView({ agent, onChat, ...headerProps }: AgentDetailViewProps) {
  return (
    <motion.div
      className="mx-auto w-full max-w-6xl flex-1 overflow-y-auto px-8 pb-40 pt-6"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
    >
      <AgentDetailHeader name={agent.name} onChat={() => onChat()} {...headerProps} />

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <aside>
          <div className="mx-auto aspect-square w-full max-w-[300px]">
            <AgentAvatar
              name={agent.name}
              seed={agent.id}
              tint={agent.tint}
              icon={agent.icon}
              character={agent.character}
              size="lg"
            />
          </div>
          <div className="mt-8 space-y-5 border-t border-border/60 pt-6">
            <DetailField label="Description">{agent.description || "No description yet."}</DetailField>
            <DetailField label="Provider">{providerLabel(agent.engineId)}</DetailField>
            <DetailField label="Model">{agent.model || DEFAULT_LABEL}</DetailField>
          </div>
        </aside>

        <section className="min-w-0">
          <p className="mb-3 text-sm text-muted-foreground">Instructions</p>
          <div className="max-h-[calc(100vh-14rem)] overflow-y-auto rounded-2xl border border-border/50 bg-card/60 px-6 py-5 text-sm leading-relaxed text-foreground">
            {agent.instructions ? (
              <MessageResponse>{agent.instructions}</MessageResponse>
            ) : (
              <p className="text-muted-foreground">This agent has no instructions yet.</p>
            )}
          </div>
        </section>
      </div>

      <AgentQuickComposer agent={agent} onStart={(message) => onChat(message || undefined)} />
    </motion.div>
  );
}
