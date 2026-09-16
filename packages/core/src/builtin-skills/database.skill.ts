import type { BuiltinSkill } from "./types.ts";

export const databaseSkill: BuiltinSkill = {
  name: "database",
  description: "Schema and query changes.",
  body:
    "Never write a migration that drops or renames a column without a " +
    "reversible path. Avoid N+1 queries. Select only the columns a query " +
    "actually needs.",
};
