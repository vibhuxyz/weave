import type { TeamToolRegistry, ToolRunner } from "./types.ts";

export function createTeamToolRegistry(): TeamToolRegistry {
  const runners = new Map<string, ToolRunner>();
  return {
    register: (token, run) => {
      runners.set(token, run);
      return () => {
        runners.delete(token);
      };
    },
    runnerFor: (token) => runners.get(token),
  };
}
