import type { NormalizedPlugin } from "../plugin.ts";

/**
 * A source of discoverable plugins. Claude Code's on-disk marketplace cache is
 * the first implementation; GitHub / Weave-native providers can be added later
 * without touching the rest of the pipeline.
 *
 * `listPlugins` must never throw — a broken or absent source returns `[]`.
 */
export interface PluginCatalogProvider {
  id: string;
  label: string;
  listPlugins(): Promise<NormalizedPlugin[]>;
}
