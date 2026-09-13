import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { RefreshCwIcon, SearchIcon } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  capabilitySummary,
  type NormalizedPlugin,
} from "@weave/core/plugins/plugin.ts";
import type { ProjectPlugin } from "../useProjects";
import { compatLine, pluginTier, TIER_META, type PluginTier } from "./pluginCompat";
import { PluginGlyph } from "./PluginGlyph";

type Mode = "off" | "manual" | "always";

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "off", label: "Off", hint: "not attached" },
  { id: "manual", label: "Manual", hint: "activate only for runs you switch it on" },
  { id: "always", label: "Always", hint: "activate for every new chat" },
];

const TIER_ORDER: PluginTier[] = ["universal", "mcp", "claude"];

function installs(n: number | undefined): string {
  if (!n) return "";
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K installs`;
  return `${n} installs`;
}

export function PluginsView({
  catalog,
  projectPlugins,
  onProjectPluginsChange,
  onRefresh,
  engineId,
  engineLabel,
  hasProject,
}: {
  catalog: NormalizedPlugin[];
  projectPlugins: ProjectPlugin[];
  onProjectPluginsChange: (next: ProjectPlugin[]) => void;
  onRefresh: () => void;
  engineId: string | undefined;
  engineLabel: string | undefined;
  hasProject: boolean;
}) {
  const [query, setQuery] = useState("");

  const modeOf = (id: string): Mode =>
    projectPlugins.find((p) => p.id === id)?.mode ?? "off";

  const setMode = (plugin: NormalizedPlugin, mode: Mode) => {
    const rest = projectPlugins.filter((p) => p.id !== plugin.id);
    onProjectPluginsChange(
      mode === "off"
        ? rest
        : [...rest, { id: plugin.id, mode, version: plugin.version }],
    );
  };

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q
      ? catalog.filter((p) =>
          `${p.name} ${p.description} ${p.marketplace}`.toLowerCase().includes(q),
        )
      : catalog;
    const by: Record<PluginTier, NormalizedPlugin[]> = {
      universal: [],
      mcp: [],
      claude: [],
    };
    for (const p of matched) by[pluginTier(p)].push(p);
    return by;
  }, [catalog, query]);

  const total = groups.universal.length + groups.mcp.length + groups.claude.length;

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 overflow-y-auto p-8">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="font-medium text-lg text-foreground">Plugins</h1>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          leftIcon={<RefreshCwIcon />}
          onClick={onRefresh}
        >
          Refresh
        </Button>
      </div>
      <p className="mb-6 max-w-2xl text-muted-foreground text-sm">
        Browsed from Claude Code's marketplace, grouped by which engines can run
        them. Set each to Always, Manual, or Off per project — the same way agents
        attach.
      </p>

      <div className="relative mb-10 max-w-md">
        <SearchIcon className="-translate-y-1/2 absolute top-1/2 left-3 size-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search plugins…"
          className="rounded-full pl-9"
        />
      </div>

      {!hasProject && (
        <p className="mb-8 rounded-lg border border-border/50 border-dashed p-3 text-center text-muted-foreground text-xs">
          Open a project to attach plugins to it.
        </p>
      )}

      {catalog.length === 0 ? (
        <p className="rounded-xl border border-border/50 border-dashed p-8 text-center text-muted-foreground text-sm">
          No plugins found. The catalog comes from <code>~/.claude/plugins/</code> —
          run <code>claude</code> and open <code>/plugin</code> once to populate it,
          then Refresh.
        </p>
      ) : total === 0 ? (
        <p className="py-12 text-center text-muted-foreground text-sm">
          No plugins match “{query}”.
        </p>
      ) : (
        <div className="space-y-14">
          {TIER_ORDER.map((tier) => {
            const list = groups[tier];
            if (list.length === 0) return null;
            const meta = TIER_META[tier];
            return (
              <section key={tier}>
                <div className="mb-6 flex items-baseline gap-2.5">
                  <h2 className="font-medium text-foreground text-sm">
                    {meta.label}
                  </h2>
                  <span className="text-muted-foreground text-xs">
                    {list.length}
                  </span>
                  <span className="hidden text-muted-foreground/70 text-xs sm:inline">
                    · {meta.hint}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-8 gap-y-12 sm:grid-cols-3 xl:grid-cols-[repeat(4,minmax(0,15rem))] xl:justify-start">
                  {list.map((plugin, i) => (
                    <motion.div
                      key={plugin.id}
                      initial={{ opacity: 0, y: 8, scale: 0.985 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{
                        duration: 0.24,
                        delay: Math.min(i, 8) * 0.03,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                    >
                      <PluginTile
                        plugin={plugin}
                        mode={modeOf(plugin.id)}
                        onSetMode={(m) => setMode(plugin, m)}
                        disabled={!hasProject}
                        engineId={engineId}
                        engineLabel={engineLabel}
                      />
                    </motion.div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PluginTile({
  plugin,
  mode,
  onSetMode,
  disabled,
  engineId,
  engineLabel,
}: {
  plugin: NormalizedPlugin;
  mode: Mode;
  onSetMode: (mode: Mode) => void;
  disabled: boolean;
  engineId: string | undefined;
  engineLabel: string | undefined;
}) {
  const active = mode !== "off";
  const summary = capabilitySummary(plugin.capabilities);
  return (
    <div className="group relative flex w-full flex-col gap-3">
      <div
        className={cn(
          "relative aspect-square w-full overflow-hidden rounded-2xl transition-all duration-200",
          active
            ? "bg-agent-accent-wash/25 ring-1 ring-agent-accent/40"
            : "ring-1 ring-transparent group-hover:bg-white/[0.02]",
        )}
      >
        <PluginGlyph
          category={plugin.category}
          variant="hero"
          className="h-full w-full transition-transform duration-200 group-hover:scale-[1.04]"
        />

        {active && (
          <span className="absolute top-2.5 right-2.5 rounded-full bg-agent-accent/15 px-2 py-0.5 text-[10px] text-agent-accent">
            {mode === "always" ? "Always" : "Manual"}
          </span>
        )}

        {/* tri-state, revealed on hover like the Agents tile's actions */}
        <div
          className={cn(
            "-translate-x-1/2 pointer-events-none absolute bottom-3 left-1/2 z-10 flex rounded-full border border-white/10 bg-black/70 p-0.5 text-[10px] opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100 focus-within:opacity-100",
            disabled && "hidden",
          )}
        >
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              title={m.hint}
              onClick={() => onSetMode(m.id)}
              className={cn(
                "pointer-events-auto rounded-full px-2.5 py-1 transition-colors",
                mode === m.id
                  ? "bg-agent-accent text-white"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium text-foreground text-sm">
            {plugin.name}
          </p>
          {plugin.homepage && (
            <button
              type="button"
              onClick={() => void openUrl(plugin.homepage!)}
              title="Open plugin page"
              className="shrink-0 text-muted-foreground/60 opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
            >
              ↗
            </button>
          )}
        </div>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground/70">
          {plugin.marketplace}
          {plugin.installs ? ` · ${installs(plugin.installs)}` : ""}
        </p>
        <p className="mt-1 line-clamp-2 max-w-[28ch] text-muted-foreground text-xs leading-relaxed">
          {plugin.description}
        </p>
        <p className="mt-1.5 max-w-[28ch] text-[11px] text-muted-foreground/60">
          {summary ? `${summary} — ` : ""}
          {compatLine(plugin, engineId, engineLabel)}
        </p>
      </div>
    </div>
  );
}
