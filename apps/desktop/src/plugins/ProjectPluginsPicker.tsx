import { cn } from "@/shared/lib/cn";
import {
  capabilitySummary,
  type NormalizedPlugin,
} from "@weave/core/plugins/plugin.ts";
import type { ProjectPlugin } from "../useProjects";
import { PluginGlyph } from "./PluginGlyph";

type Mode = "off" | "manual" | "always";

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "off", label: "Off", hint: "not attached" },
  { id: "manual", label: "Manual", hint: "activate only for runs you switch it on" },
  { id: "always", label: "Always", hint: "activate for every new chat" },
];

/**
 * Attach plugins to a project and pick how each one runs: Off, Manual (opt in
 * per chat from the context panel), or Always (activated on every new chat).
 * The tri-state mirrors `ProjectAgentsPicker`; "off" = absent from the array.
 */
export function ProjectPluginsPicker({
  value,
  onChange,
  plugins,
  compact,
}: {
  value: ProjectPlugin[];
  onChange: (next: ProjectPlugin[]) => void;
  plugins: NormalizedPlugin[];
  compact?: boolean;
}) {
  const modeOf = (id: string): Mode =>
    value.find((p) => p.id === id)?.mode ?? "off";

  const setMode = (plugin: NormalizedPlugin, mode: Mode) => {
    const rest = value.filter((p) => p.id !== plugin.id);
    onChange(
      mode === "off"
        ? rest
        : [...rest, { id: plugin.id, mode, version: plugin.version }],
    );
  };

  return (
    <div className="flex flex-col gap-1.5">
      {plugins.map((plugin) => {
        const mode = modeOf(plugin.id);
        const summary = capabilitySummary(plugin.capabilities);
        return (
          <div
            key={plugin.id}
            className={cn(
              "rounded-lg px-2 py-2",
              compact ? "flex flex-col gap-2" : "flex items-center gap-2.5",
              mode !== "off" ? "bg-black/25" : "bg-transparent",
            )}
          >
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <PluginGlyph
                category={plugin.category}
                className="size-7 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">{plugin.name}</p>
                <p className="truncate text-muted-foreground text-xs">
                  {compact
                    ? plugin.marketplace
                    : summary || plugin.description}
                </p>
              </div>
            </div>
            <div
              className={cn(
                "flex shrink-0 rounded-md border border-white/10 bg-black/30 p-0.5 text-[10px]",
                compact && "self-stretch",
              )}
            >
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  title={m.hint}
                  onClick={() => setMode(plugin, m.id)}
                  className={cn(
                    "rounded-sm px-1.5 py-0.5 transition-colors",
                    compact && "flex-1 text-center",
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
