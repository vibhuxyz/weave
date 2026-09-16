import type { NormalizedPlugin } from "../plugin.ts";
import { ClaudeCatalogProvider } from "./claude-provider.ts";
import type { PluginCatalogProvider } from "./provider.ts";

export { ClaudeCatalogProvider };
export type { PluginCatalogProvider };

export async function resolveCatalog(
  providers: PluginCatalogProvider[] = [new ClaudeCatalogProvider()],
): Promise<NormalizedPlugin[]> {
  const byId = new Map<string, NormalizedPlugin>();
  for (const provider of providers) {
    let plugins: NormalizedPlugin[] = [];
    try {
      plugins = await provider.listPlugins();
    } catch {
      plugins = [];
    }
    for (const plugin of plugins) {
      if (!byId.has(plugin.id)) byId.set(plugin.id, plugin);
    }
  }
  return [...byId.values()];
}
