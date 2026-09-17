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
    [
      { dir: "/Users/xyz/Coding/Perp", name: "Perp" },
      { dir: "/Users/xyz/Coding/Weave", name: "Weave" },
    ],
    (value, defaults) => {
      if (!Array.isArray(value)) return defaults;
      const valid = value.filter(
        (entry): entry is ProjectEntry =>
          !!entry && typeof (entry as ProjectEntry).dir === "string",
      );
      if (valid.length === 0) return defaults;
      const hasWeave = valid.some(
        (e) =>
          e.name?.toLowerCase() === "weave" ||
          e.dir.toLowerCase().includes("weave"),
      );
      if (!hasWeave) {
        return [...valid, { dir: "/Users/xyz/Coding/Weave", name: "Weave" }];
      }
      return valid;
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

  return { projects, remember, forget, setProjectAgents, setProjectPlugins };
}
