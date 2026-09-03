import { useCallback } from "react";
import { usePersistedState } from "@/shared/hooks/usePersistedState";

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
}

export interface ProjectMeta {
  name?: string;
  tint?: string;
  icon?: string;
  notes?: string;
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

  return { projects, remember, forget };
}
