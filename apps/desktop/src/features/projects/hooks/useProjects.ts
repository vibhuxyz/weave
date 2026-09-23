import { useCallback } from "react";
import { usePersistedState } from "@/shared/hooks";

export interface ProjectAgent {
  id: string;
  mode: "always" | "manual";
}

export interface ProjectPlugin {
  id: string;
  version?: string;
  mode: "always" | "manual";
  enabledCapabilities?: string[];
}

export interface ProjectEntry {
  dir: string;
  engineId?: string;
  name?: string;
  tint?: string;
  icon?: string;
  notes?: string;
  agents?: ProjectAgent[];
  plugins?: ProjectPlugin[];
  sandboxed?: boolean;
  archivedAt?: string;
}

export interface ProjectMeta {
  name?: string;
  tint?: string;
  icon?: string;
  notes?: string;
  agents?: ProjectAgent[];
  plugins?: ProjectPlugin[];
  sandboxed?: boolean;
}

export function useProjects() {
  const [projects, setProjects] = usePersistedState<ProjectEntry[]>(
    "berd:projects",
    [],
    (value, defaults) => {
      if (!Array.isArray(value)) return defaults;
      return value.filter(
        (entry): entry is ProjectEntry =>
          !!entry && typeof (entry as ProjectEntry).dir === "string",
      );
    },
  );

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

  const setProjectPlugins = useCallback(
    (dir: string, plugins: ProjectPlugin[]) =>
      setProjects((current) =>
        current.map((entry) =>
          entry.dir === dir ? { ...entry, plugins } : entry,
        ),
      ),
    [setProjects],
  );

  const setArchivedAt = useCallback(
    (dir: string, archivedAt: string | undefined) =>
      setProjects((current) =>
        current.map((entry) => (entry.dir === dir ? { ...entry, archivedAt } : entry)),
      ),
    [setProjects],
  );
  const archive = useCallback(
    (dir: string, now: Date) => setArchivedAt(dir, now.toISOString()),
    [setArchivedAt],
  );
  const unarchive = useCallback((dir: string) => setArchivedAt(dir, undefined), [setArchivedAt]);

  return { projects, remember, forget, archive, unarchive, setProjectAgents, setProjectPlugins };
}
