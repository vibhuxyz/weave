import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  emptyCapabilities,
  type NormalizedPlugin,
  type PluginCapabilities,
  type PluginCapabilityKind,
  type PluginComponentRef,
} from "../plugin.ts";
import type { PluginCatalogProvider } from "./provider.ts";

export class ClaudeCatalogProvider implements PluginCatalogProvider {
  readonly id = "claude-catalog";
  readonly label = "Claude Code marketplace";
  private readonly root: string;

  constructor(root?: string) {
    this.root = root ?? join(homedir(), ".claude", "plugins");
  }

  async listPlugins(): Promise<NormalizedPlugin[]> {
    const installed = await this.readInstalled();
    const fromCache = await this.readCache(installed);
    if (fromCache.length > 0) return fromCache;
    return this.readMarketplaces(installed);
  }

  private async readJson(rel: string): Promise<unknown> {
    try {
      return JSON.parse(await readFile(join(this.root, rel), "utf8"));
    } catch {
      return undefined;
    }
  }

  private async readInstalled(): Promise<Set<string>> {
    const doc = await this.readJson("installed_plugins.json");
    const plugins = (doc as { plugins?: Record<string, unknown> } | undefined)?.plugins;
    return new Set(plugins ? Object.keys(plugins) : []);
  }

  private async readCache(installed: Set<string>): Promise<NormalizedPlugin[]> {
    const doc = await this.readJson("plugin-catalog-cache.json");
    const plugins = (
      doc as { catalog?: { plugins?: Record<string, RawCatalogEntry> } } | undefined
    )?.catalog?.plugins;
    if (!plugins) return [];

    const out = Object.entries(plugins).map(([id, raw]) => normalizeCatalogEntry(id, raw, installed, this.id));
    return out.sort(byInstalls);
  }

  private async readMarketplaces(installed: Set<string>): Promise<NormalizedPlugin[]> {
    const known = (await this.readJson("known_marketplaces.json")) as
      | Record<string, unknown>
      | undefined;
    if (!known) return [];

    const out: NormalizedPlugin[] = [];
    for (const mp of Object.keys(known)) {
      const doc = (await this.readJson(
        join("marketplaces", mp, ".claude-plugin", "marketplace.json"),
      )) as { plugins?: RawMarketplacePlugin[] } | undefined;
      for (const p of doc?.plugins ?? []) {
        if (!p?.name) continue;
        out.push(normalizeMarketplacePlugin(p, mp, installed, this.id));
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }
}

interface RawComponentObj {
  name: string;
  chars?: { always_on?: number; on_invoke?: number };
}
type RawComponent = RawComponentObj | string;

interface RawCatalogEntry {
  plugin?: string;
  version?: string;
  sha?: string;
  source_sha?: string;
  unique_installs?: number;
  last_updated?: string;
  tokens?: Record<string, { always_on?: number; on_invoke?: number }>;
  components?: Partial<Record<string, RawComponent[]>>;
  marketplace_entry?: {
    name?: string;
    description?: string;
    author?: string | { name?: string };
    category?: string;
    homepage?: string;
    source?: { url?: string; path?: string; ref?: string; sha?: string };
  };
}

interface RawMarketplacePlugin {
  name?: string;
  description?: string;
  author?: string | { name?: string };
  category?: string;
  homepage?: string;
  source?: { url?: string; path?: string; ref?: string; sha?: string };
}

function normalizeCatalogEntry(
  id: string,
  raw: RawCatalogEntry,
  installed: Set<string>,
  provider: string,
): NormalizedPlugin {
  const entry = raw?.marketplace_entry ?? {};
  const marketplace = id.includes("@") ? id.slice(id.lastIndexOf("@") + 1) : "";
  return {
    id,
    name: entry.name ?? raw?.plugin ?? id,
    description: entry.description ?? "",
    marketplace,
    version: raw?.version ?? "unknown",
    contentHash: raw?.sha ?? raw?.source_sha ?? "",
    author: typeof entry.author === "string" ? entry.author : entry.author?.name,
    category: entry.category,
    homepage: entry.homepage,
    installs: raw?.unique_installs,
    lastUpdated: raw?.last_updated,
    source: entry.source && {
      url: entry.source.url,
      path: entry.source.path,
      ref: entry.source.ref,
      sha: entry.source.sha,
    },
    capabilities: normalizeComponents(raw?.components),
    provider,
    installed: installed.has(id),
    tokenCost: firstTokenCost(raw?.tokens),
  };
}

function normalizeMarketplacePlugin(
  p: RawMarketplacePlugin,
  marketplace: string,
  installed: Set<string>,
  provider: string,
): NormalizedPlugin {
  const id = `${p.name}@${marketplace}`;
  return {
    id,
    name: p.name ?? id,
    description: p.description ?? "",
    marketplace,
    version: "unknown",
    contentHash: p.source?.sha ?? "",
    author: typeof p.author === "string" ? p.author : p.author?.name,
    category: p.category,
    homepage: p.homepage,
    source: p.source,
    capabilities: emptyCapabilities(),
    provider,
    installed: installed.has(id),
  };
}

const COMPONENT_KINDS: { key: string; field: keyof PluginCapabilities; kind: PluginCapabilityKind }[] = [
  { key: "commands", field: "commands", kind: "command" },
  { key: "skills", field: "skills", kind: "skill" },
  { key: "agents", field: "agents", kind: "agent" },
  { key: "mcpServers", field: "mcpServers", kind: "mcpServer" },
  { key: "hooks", field: "hooks", kind: "hook" },
  { key: "lspServers", field: "lspServers", kind: "lspServer" },
];

function normalizeComponents(
  components: Partial<Record<string, RawComponent[]>> | undefined,
): PluginCapabilities {
  const caps = emptyCapabilities();
  if (!components) return caps;
  for (const { key, field, kind } of COMPONENT_KINDS) {
    const list = components[key] ?? [];
    caps[field] = list.map((c): PluginComponentRef => ({
      name: typeof c === "string" ? c : c.name,
      kind,
    }));
  }
  return caps;
}

function firstTokenCost(
  tokens: Record<string, { always_on?: number; on_invoke?: number }> | undefined,
): { alwaysOn: number; onInvoke: number } | undefined {
  const first = tokens && Object.values(tokens)[0];
  if (!first) return undefined;
  return { alwaysOn: first.always_on ?? 0, onInvoke: first.on_invoke ?? 0 };
}

function byInstalls(a: NormalizedPlugin, b: NormalizedPlugin): number {
  return (b.installs ?? 0) - (a.installs ?? 0) || a.name.localeCompare(b.name);
}
