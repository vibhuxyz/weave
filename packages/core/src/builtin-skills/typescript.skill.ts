import type { BuiltinSkill } from "./types.ts";

export const typescriptSkill: BuiltinSkill = {
  name: "typescript",
  description: "Writing strict, precisely-typed TypeScript.",
  body:
    "Use TypeScript strict mode. Never use `any` — use `unknown` and narrow it. " +
    "Prefer discriminated unions over multiple boolean flags for state. " +
    "Infer types from a single source of truth instead of writing the same shape twice.",
};
