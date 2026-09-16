import type { BuiltinSkill } from "./types.ts";

export const frontendSkill: BuiltinSkill = {
  name: "frontend",
  description: "Building and modifying UI components.",
  body:
    "Match the existing component structure and state-management pattern in " +
    "this repo. Keep one exported component per file. Lazy-load routes and " +
    "heavy libraries; add memoization only when a measured problem calls for it.",
};
