import { CheckIcon } from "lucide-react";
import { cn } from "@/shared/lib";
import { getProviderIcon } from "@/shared/ui/icons";
import {
  DISPLAY_AGENTS,
  type DisplayAgent,
} from "./constants";
import type { EngineItem } from "./types";

interface AgentListColumnProps {
  activeEngineId: string;
  engines?: readonly EngineItem[];
  hasRightBorder?: boolean;
  onSelectAgent: (agentId: string, isInstalled: boolean) => void;
  onRequestManageProviders: () => void;
}

export function AgentListColumn({
  activeEngineId,
  engines,
  hasRightBorder = true,
  onSelectAgent,
  onRequestManageProviders,
}: AgentListColumnProps) {
  const getEngineState = (agentId: string) => {
    const matched = engines?.find(
      (e) =>
        e.id === agentId ||
        (agentId === "antigravity" && e.id === "gemini") ||
        (agentId === "gemini" && e.id === "antigravity")
    );
    return {
      installed: Boolean(matched?.installed),
      authenticated: Boolean(matched?.authenticated),
    };
  };

  return (
    <div
      className={cn(
        "flex w-[195px] flex-col",
        hasRightBorder && "border-r border-white/10 pr-2",
      )}
    >
      <div className="px-2 pb-2 text-xs font-semibold tracking-wide text-zinc-400">
        Agent
      </div>
      <div className="flex flex-col gap-0.5">
        {DISPLAY_AGENTS.map((agent: DisplayAgent) => {
          const { installed, authenticated } = getEngineState(agent.id);
          const isSelected =
            agent.id === activeEngineId ||
            (agent.id === "antigravity" && activeEngineId === "gemini") ||
            (agent.id === "gemini" && activeEngineId === "antigravity");
          
          const isReady = installed && authenticated;

          return (
            <button
              key={agent.id}
              type="button"
              onClick={() => {
                if (isReady) {
                  onSelectAgent(agent.id, true);
                } else {
                  onRequestManageProviders();
                }
              }}
              className={cn(
                "group relative flex h-8 w-full items-center justify-between rounded-lg px-2 text-left text-sm transition-colors",
                isSelected
                  ? "bg-white/15 text-white font-medium"
                  : "text-zinc-300 hover:bg-white/5 hover:text-white",
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="shrink-0">
                  {getProviderIcon(agent.id, "size-4") || (
                    <div className="size-4 rounded bg-zinc-700" />
                  )}
                </span>
                <span className="truncate">{agent.label}</span>
              </div>

              {isReady ? (
                isSelected && (
                  <CheckIcon className="size-3.5 text-zinc-400 shrink-0" />
                )
              ) : (
                <span
                  className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] font-medium text-zinc-300 transition-colors group-hover:border-white/30 group-hover:bg-white/10 group-hover:text-white"
                >
                  Connect
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
