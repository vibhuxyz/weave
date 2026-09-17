import { useCallback, useMemo } from "react";
import { usePersistedState } from "@/shared/hooks";
import { BUILTINS } from "./useAgents/builtins";
import { isAgent, type Agent, type AgentDraft } from "./useAgents/types";

export type { Agent, AgentDraft } from "./useAgents/types";
export { activeAgents, formatPersonaSystemPrompt } from "./useAgents/personaPrompt";

const now = () => Date.now();

/**
 * The user's agents (localStorage), with the built-in starters merged in.
 * Same pattern as `useProjects`.
 */
export function useAgents() {
  const [stored, setStored] = usePersistedState<Agent[]>(
    "berd:agents",
    [],
    (value, defaults) =>
      Array.isArray(value) ? value.filter(isAgent) : defaults,
  );

  // Built-ins the user deleted. They live in code, so the only way to keep one
  // gone across reloads is to remember that it was.
  const [removedBuiltins, setRemovedBuiltins] = usePersistedState<string[]>(
    "berd:agents:removed",
    [],
    (value, defaults) =>
      Array.isArray(value) ? value.filter((v) => typeof v === "string") : defaults,
  );

  const agents = useMemo(() => {
    // An edited built-in is stored like any other agent, under the same id;
    // the stored copy then stands in for the one in code.
    const overrides = new Map(
      stored.filter((a) => a.builtin).map((a) => [a.id, a]),
    );
    const builtins = BUILTINS.filter((b) => !removedBuiltins.includes(b.id)).map(
      (b) => overrides.get(b.id) ?? b,
    );
    // Built-ins first, then user agents (newest first — stored unshift order).
    const custom = stored.filter((a) => !a.builtin);
    return [...builtins, ...custom];
  }, [stored, removedBuiltins]);

  const create = useCallback(
    (draft: AgentDraft): Agent => {
      const agent: Agent = {
        ...draft,
        id: `agent:${crypto.randomUUID()}`,
        builtin: false,
        createdAt: now(),
        updatedAt: now(),
      };
      setStored((cur) => [agent, ...cur]);
      return agent;
    },
    [setStored],
  );

  const update = useCallback(
    (id: string, patch: Partial<AgentDraft>) => {
      setStored((cur) => {
        if (cur.some((a) => a.id === id)) {
          return cur.map((a) =>
            a.id === id ? { ...a, ...patch, updatedAt: now() } : a,
          );
        }
        // First edit of a built-in: store a full copy to override the one in
        // code, keeping `builtin` so it still sorts and resets as a built-in.
        const builtin = BUILTINS.find((b) => b.id === id);
        if (!builtin) return cur;
        return [...cur, { ...builtin, ...patch, updatedAt: now() }];
      });
    },
    [setStored],
  );

  const remove = useCallback(
    (id: string) => {
      setStored((cur) => cur.filter((a) => a.id !== id));
      if (BUILTINS.some((b) => b.id === id)) {
        setRemovedBuiltins((cur) => (cur.includes(id) ? cur : [...cur, id]));
      }
    },
    [setStored, setRemovedBuiltins],
  );

  /**
   * Put a built-in back the way it ships — undoes both an edit and a delete.
   * Without it a built-in overwritten by mistake is gone for good.
   */
  const resetBuiltin = useCallback(
    (id: string) => {
      setStored((cur) => cur.filter((a) => !(a.id === id && a.builtin)));
      setRemovedBuiltins((cur) => cur.filter((v) => v !== id));
    },
    [setStored, setRemovedBuiltins],
  );

  /** True when this built-in has been edited or deleted by the user. */
  const isBuiltinModified = useCallback(
    (id: string) =>
      removedBuiltins.includes(id) ||
      stored.some((a) => a.id === id && a.builtin),
    [removedBuiltins, stored],
  );

  const duplicate = useCallback(
    (id: string): Agent | undefined => {
      const src = agents.find((a) => a.id === id);
      if (!src) return undefined;
      return create({
        name: `${src.name} copy`,
        description: src.description,
        instructions: src.instructions,
        engineId: src.engineId,
        model: src.model,
        tint: src.tint,
        icon: src.icon,
        character: src.character,
      });
    },
    [agents, create],
  );

  return {
    agents,
    create,
    update,
    remove,
    duplicate,
    resetBuiltin,
    isBuiltinModified,
  };
}
