import { useCallback } from "react";
import { usePersistedState } from "@/shared/hooks/usePersistedState";

/** An agent attached to a project. `always` = injected into every new chat. */
export interface ProjectAgent {
  id: string;
  mode: "always" | "manual";
}

export interface ProjectEntry {
  dir: string;
  engineId?: string;
  /** Display name; defaults to the folder basename when absent. */
  name?: string;
  /** Accent hex from the tint picker. */
  tint?: string;
  /** Custom icon as a data URI. */
  icon?: string;
  /** "What should the agent know about this project?" — not yet fed to the agent. */
  notes?: string;
  /** Standing agents for this project (their instructions steer new chats). */
  agents?: ProjectAgent[];
}

export interface ProjectMeta {
  name?: string;
  tint?: string;
  icon?: string;
  notes?: string;
  agents?: ProjectAgent[];
}

/**
 * The list of projects the user has opened, kept in localStorage.
 *
 * The Rust side only remembers the *last* project (for auto-open on launch);
 * this is the full set shown in the sidebar. Switching between them restarts
 * the ACP server via `useProject().startWith`.
 */
export function useProjects() {
  const [projects, setProjects] = usePersistedState<ProjectEntry[]>(
    "berd:projects",
    [],
    (value, defaults) =>
      Array.isArray(value)
        ? value.filter(
            (entry): entry is ProjectEntry =>
              !!entry && typeof (entry as ProjectEntry).dir === "string",
          )
        : defaults,
  );

  /** Add or refresh a project. Keeps existing metadata unless `meta` overrides it. */
  const remember = useCallback(
    (dir: string, engineId?: string, meta?: ProjectMeta) => {
      setProjects((current) => {
        const prev = current.find((entry) => entry.dir === dir);
        const rest = current.filter((entry) => entry.dir !== dir);
        return [{ ...prev, dir, engineId, ...meta }, ...rest];
      });
    },
    [setProjects],
  );

  const forget = useCallback(
    (dir: string) =>
      setProjects((current) => current.filter((entry) => entry.dir !== dir)),
    [setProjects],
  );

  const setProjectAgents = useCallback(
    (dir: string, agents: ProjectAgent[]) =>
      setProjects((current) =>
        current.map((entry) =>
          entry.dir === dir ? { ...entry, agents } : entry,
        ),
      ),
    [setProjects],
  );

  return { projects, remember, forget, setProjectAgents };
}
