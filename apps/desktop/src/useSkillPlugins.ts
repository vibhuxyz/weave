import { useCallback } from "react";
import { usePersistedState } from "@/shared/hooks/usePersistedState";

/**
 * A plugin/skill the user found on an agent or provider's official page
 * (a Claude Code plugin, an MCP server, a style guide, etc.) and wants the
 * agent to know about. Weave has no marketplace of its own — this is a
 * pointer plus instructions, not an install.
 */
export interface SkillPlugin {
  id: string;
  name: string;
  description: string;
  url?: string;
  /** "always" rides every project; "project" only rides `projectDir`. */
  scope: "always" | "project";
  projectDir?: string;
  createdAt: number;
  updatedAt: number;
}

export type SkillPluginDraft = Omit<SkillPlugin, "id" | "createdAt" | "updatedAt">;

const now = () => Date.now();

function isSkillPlugin(v: unknown): v is SkillPlugin {
  return (
    !!v &&
    typeof (v as SkillPlugin).id === "string" &&
    typeof (v as SkillPlugin).name === "string" &&
    ((v as SkillPlugin).scope === "always" || (v as SkillPlugin).scope === "project")
  );
}

/** The user's plugins (localStorage). Same pattern as `useAgents`. */
export function useSkillPlugins() {
  const [plugins, setPlugins] = usePersistedState<SkillPlugin[]>(
    "berd:skill-plugins",
    [],
    (value, defaults) =>
      Array.isArray(value) ? value.filter(isSkillPlugin) : defaults,
  );

  const create = useCallback(
    (draft: SkillPluginDraft): SkillPlugin => {
      const plugin: SkillPlugin = {
        ...draft,
        id: `plugin:${crypto.randomUUID()}`,
        createdAt: now(),
        updatedAt: now(),
      };
      setPlugins((cur) => [plugin, ...cur]);
      return plugin;
    },
    [setPlugins],
  );

  const update = useCallback(
    (id: string, patch: Partial<SkillPluginDraft>) => {
      setPlugins((cur) =>
        cur.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: now() } : p)),
      );
    },
    [setPlugins],
  );

  const remove = useCallback(
    (id: string) => setPlugins((cur) => cur.filter((p) => p.id !== id)),
    [setPlugins],
  );

  return { plugins, create, update, remove };
}

/**
 * The plugins half of the system prompt: every "always" plugin, plus any
 * "project" plugin scoped to `projectDir`. Mirrors
 * `formatPersonaSystemPrompt`'s shape so the server can merge both into one
 * `<system>` block.
 *
 * `undefined` when nothing applies, so the server can skip the block.
 */
export function formatSkillPluginsSystemPrompt(
  plugins: SkillPlugin[],
  projectDir: string | undefined,
): string | undefined {
  const active = plugins.filter(
    (p) => p.scope === "always" || p.projectDir === projectDir,
  );
  if (active.length === 0) return undefined;

  const body = active
    .map((p) => `- ${p.name}: ${p.description}${p.url ? `\n  Source: ${p.url}` : ""}`)
    .join("\n");

  return [
    "<enabled-plugins>",
    "The user enabled these plugins for this conversation, found on the",
    "provider's official page. Apply their guidance where it's relevant to",
    "the task in front of you.",
    "",
    body,
    "</enabled-plugins>",
  ].join("\n");
}
