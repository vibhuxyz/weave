import { useMemo } from "react";
import type { NormalizedPlugin } from "@weave/core/plugins/plugin.ts";
import type { ActivePluginRef } from "@weave/core/plugins/resolve.ts";
import type { ProjectPlugin } from "./useProjects";

export type { NormalizedPlugin, ActivePluginRef };

/**
 * Bridges the plugin catalog (from the server) and the per-project selection
 * (localStorage) into the shape `submit()` sends and the views render.
 *
 * Resolution — which capabilities each engine can actually run — happens
 * server-side, where the live engine is known. This hook only decides *which*
 * plugins are active for the next turn.
 */
export function usePlugins(
  catalog: NormalizedPlugin[],
  projectPlugins: ProjectPlugin[],
  manualActiveIds: string[],
) {
  const byId = useMemo(
    () => new Map(catalog.map((p) => [p.id, p])),
    [catalog],
  );

  const activeRefs = useMemo<ActivePluginRef[]>(() => {
    const manual = new Set(manualActiveIds);
    return projectPlugins
      .filter((p) => p.mode === "always" || manual.has(p.id))
      .map((p) => ({
        id: p.id,
        version: p.version ?? byId.get(p.id)?.version ?? "unknown",
        mode: p.mode,
        enabledCapabilities: p.enabledCapabilities,
      }));
  }, [projectPlugins, manualActiveIds, byId]);

  return { byId, activeRefs };
}
