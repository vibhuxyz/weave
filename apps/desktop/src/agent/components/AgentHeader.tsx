import { SparklesIcon } from "lucide-react";
import { AgentAvatar } from "../../agents/AgentAvatar";
import type { AgentRunMeta } from "../normalize/types";
import { TokenUsage } from "./TokenUsage";

export type DepthLevel = "brief" | "normal" | "deep";

/** Past this many agent chips the row stops naming them and counts instead. */
const MAX_PERSONA_CHIPS = 3;

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
        {/* Who the engine was told to be. Without this the card names the
            engine and model but not the persona, which is the part the user
            actually chose. */}
        {(meta.personas ?? []).slice(0, MAX_PERSONA_CHIPS).map((persona) => (
          <span
            key={persona.id}
            title={`Agent: ${persona.name}`}
            className="flex min-w-0 items-center gap-1.5 rounded-full border border-agent-chip-border bg-agent-chip-bg py-1 pr-2.5 pl-1 text-agent-text-muted text-xs"
          >
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
        ))}
        {(meta.personas?.length ?? 0) > MAX_PERSONA_CHIPS && (
          <span
            title={meta.personas?.map((p) => p.name).join(", ")}
            className="shrink-0 text-agent-text-faint text-xs"
          >
            +{(meta.personas?.length ?? 0) - MAX_PERSONA_CHIPS}
          </span>
        )}
      </div>

      <TokenUsage meta={meta} engineId={engineId} />
    </div>
  );
}
