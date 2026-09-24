import type { BuiltinSkill } from "../builtin-skills/index.ts";

export const nodeSkill: BuiltinSkill = {
  name: "node",
  description: "Server and CLI code running on Node.js.",
  body:
    "Use `node:` imports for built-ins. Never block the event loop with sync I/O in a request path. " +
    "Pass an AbortSignal and a timeout to every outbound call, stream large files instead of reading them whole, " +
    "and handle SIGTERM by finishing in-flight work before exit.",
};

export const postgresSkill: BuiltinSkill = {
  name: "postgres",
  description: "Queries, schema and migrations on PostgreSQL.",
  body:
    "Use parameterised queries only. Keep transactions short and never make a network call inside one. " +
    "Index every foreign key and every hot WHERE + ORDER BY. Create indexes CONCURRENTLY on tables with data, " +
    "store money as bigint minor units or numeric, and use timestamptz in UTC.",
};
