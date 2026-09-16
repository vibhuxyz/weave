import type { NormalizedPlugin } from "../plugin.ts";

export interface PluginCatalogProvider {
  id: string;
  label: string;
  listPlugins(): Promise<NormalizedPlugin[]>;
}
