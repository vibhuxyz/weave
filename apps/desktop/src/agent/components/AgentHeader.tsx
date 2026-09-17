import { SparklesIcon } from "lucide-react";
import { cn } from "@/shared/lib";
import { AgentAvatar } from '@/features/agents/components';
import type { TurnPersona } from '@/features/chat/hooks';
import type { AgentRunMeta } from "@/agent/normalize";
import { TokenUsage } from "./TokenUsage";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/shared/ui";

export type DepthLevel = "brief" | "normal" | "deep";

/** How many avatars the collapsed group stacks before it just counts. */
const MAX_STACKED_AVATARS = 3;

/**
 * The run card's identity row. It carries only what is immediately useful —
 * which agent answered, on which engine and model, and how much of the context
 * window is gone.
 * File counts, the read-only badge, copy, and the depth switch were pulled out
 * of this row: counts belong to the inspector, copy belongs to the surface
 * that actually holds copyable content.
 */
export function AgentHeader({
  meta,
  engineId,
}: {
  meta: AgentRunMeta;
  /** Which engine ran this turn — decides how token usage is explained. */
  engineId: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-agent-border border-b bg-agent-surface-raised px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-agent-accent text-agent-accent-fg">
          <SparklesIcon className="size-4" />
        </span>
        <span className="shrink-0 font-medium text-sm">{meta.engineLabel}</span>
        {meta.model && (
          <span className="flex min-w-0 items-center gap-1.5 rounded-full border border-agent-chip-border bg-agent-chip-bg px-2.5 py-1 text-agent-text-muted text-xs">
            <SparklesIcon className="size-3 shrink-0 text-agent-progress-fg" />
            <span className="truncate">{meta.model}</span>
          </span>
        )}
        {/* Who the engine was told to be. One agent gets a named chip; several
            collapse into one avatar-stack chip so they never crowd the model
            out of the row — hover reveals the full list. */}
        <PersonaGroup personas={meta.personas ?? []} />
      </div>

      <TokenUsage meta={meta} engineId={engineId} />
    </div>
  );
}

/**
 * The agents in play for this turn. One is named inline; two or more stack
 * their avatars behind a count and spell themselves out on hover.
 */
function PersonaGroup({ personas }: { personas: TurnPersona[] }) {
  if (personas.length === 0) return null;

  if (personas.length === 1) {
    const persona = personas[0];
    if (!persona) return null;
    return (
      <span className="flex min-w-0 shrink-0 items-center gap-1.5 rounded-full border border-agent-chip-border bg-agent-chip-bg py-1 pr-2.5 pl-1 text-agent-text-muted text-xs">
        <AgentAvatar
          name={persona.name}
          seed={persona.id}
          icon={persona.icon}
          character={persona.character}
          size="xs"
          className="shrink-0 rounded-full"
        />
        <span className="truncate">{persona.name}</span>
      </span>
    );
  }

  const stacked = personas.slice(0, MAX_STACKED_AVATARS);

  return (
    <HoverCard openDelay={80} closeDelay={80}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="flex shrink-0 items-center gap-2 rounded-full border border-agent-chip-border bg-agent-chip-bg py-1 pr-2.5 pl-1.5 text-agent-text-muted text-xs transition-colors hover:text-agent-text-bright focus:outline-none focus-visible:ring-2 focus-visible:ring-agent-progress-fg/50"
        >
          <span className="flex items-center">
            {stacked.map((persona, i) => (
              <AgentAvatar
                key={persona.id}
                name={persona.name}
                seed={persona.id}
                icon={persona.icon}
                character={persona.character}
                size="xs"
                className={cn(
                  "shrink-0 rounded-full ring-2 ring-agent-surface-raised",
                  i > 0 && "-ml-2",
                )}
              />
            ))}
          </span>
          <span className="whitespace-nowrap">{personas.length} agents</span>
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-60 p-2">
        <p className="px-2 pt-1 pb-1.5 font-medium text-muted-foreground text-xs">
          Agents on this turn
        </p>
        <ul className="flex flex-col gap-0.5">
          {personas.map((persona) => (
            <li
              key={persona.id}
              className="flex items-center gap-2.5 rounded-md px-2 py-1.5"
            >
              <AgentAvatar
                name={persona.name}
                seed={persona.id}
                icon={persona.icon}
                character={persona.character}
                size="xs"
                className="size-6 shrink-0 rounded-full"
              />
              <span className="min-w-0 truncate text-sm">{persona.name}</span>
            </li>
          ))}
        </ul>
      </HoverCardContent>
    </HoverCard>
  );
}
