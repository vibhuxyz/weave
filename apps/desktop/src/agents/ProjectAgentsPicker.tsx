import { cn } from "@/shared/lib/cn";
import type { ProjectAgent } from "../useProjects";
import type { Agent } from "../useAgents";
import { AgentAvatar } from "./AgentAvatar";

type Mode = "off" | "manual" | "always";

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "off", label: "Off", hint: "not attached" },
  { id: "manual", label: "Manual", hint: "apply when you turn it on" },
  { id: "always", label: "Always", hint: "steers every new chat" },
];

/**
 * Attach agents to a project and pick how each one runs: Off, Manual (opt in
 * per chat from the context panel), or Always (folded into every new chat's
 * instructions). Used by the create dialog and the project context panel.
 */
export function ProjectAgentsPicker({
  value,
  onChange,
  agents,
  compact,
}: {
  value: ProjectAgent[];
  onChange: (next: ProjectAgent[]) => void;
  agents: Agent[];
  compact?: boolean;
}) {
  const modeOf = (id: string): Mode =>
    value.find((a) => a.id === id)?.mode ?? "off";

  const setMode = (id: string, mode: Mode) => {
    const rest = value.filter((a) => a.id !== id);
    onChange(mode === "off" ? rest : [...rest, { id, mode }]);
  };

  return (
    <div className="flex flex-col gap-1.5">
      {agents.map((agent) => {
        const mode = modeOf(agent.id);
        return (
          <div
            key={agent.id}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2 py-2",
              mode !== "off" ? "bg-black/25" : "bg-transparent",
            )}
          >
            <AgentAvatar
              name={agent.name}
              tint={agent.tint}
              icon={agent.icon}
              size="sm"
              className="shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-foreground">{agent.name}</p>
              {!compact && (
                <p className="truncate text-muted-foreground text-xs">
                  {agent.description}
                </p>
              )}
            </div>
            <div className="flex shrink-0 rounded-md border border-white/10 bg-black/30 p-0.5 text-[10px]">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  title={m.hint}
                  onClick={() => setMode(agent.id, m.id)}
                  className={cn(
                    "rounded-sm px-1.5 py-0.5 transition-colors",
                    mode === m.id
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
