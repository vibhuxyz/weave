import type { SkillTriggers } from "./types.ts";

const SERVER_FRAMEWORKS = ["Express", "Hono", "Fastify", "Koa", "NestJS"];

export const BUILTIN_TRIGGERS: Readonly<Record<string, SkillTriggers>> = {
  typescript: { languages: ["TypeScript"], keywords: ["typescript", "type", "tsconfig", "interface", "generic"] },
  frontend: { frameworks: ["React", "Vue", "Svelte", "Next.js", "Angular", "Vite"], layers: ["ui", "state"], keywords: ["ui", "component", "page", "screen", "css", "frontend", "button", "form", "layout"] },
  backend: { frameworks: SERVER_FRAMEWORKS, layers: ["api", "service"], keywords: ["backend", "server", "endpoint", "route", "handler", "service"] },
  "api-conventions": { layers: ["api", "contract"], keywords: ["api", "endpoint", "route", "rest", "http", "contract", "payload"] },
  database: { frameworks: ["Prisma", "Drizzle", "SQLite", "PostgreSQL"], layers: ["data"], keywords: ["database", "db", "sql", "migration", "schema", "table", "query", "repository"] },
  security: { keywords: ["auth", "login", "password", "token", "secret", "permission", "security", "session", "csrf", "encrypt"] },
  testing: { layers: ["test"], keywords: ["test", "testing", "spec", "coverage", "flaky", "assert"] },
  node: { frameworks: SERVER_FRAMEWORKS, packages: ["@types/node", "tsx", "ts-node"], keywords: ["node", "server", "process", "stream", "cli", "worker"] },
  postgres: { refines: "database", frameworks: ["PostgreSQL"], packages: ["pg", "postgres", "@neondatabase/serverless", "kysely"], keywords: ["postgres", "postgresql", "psql", "transaction", "index"] },
};
