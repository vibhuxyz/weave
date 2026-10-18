import { getBuiltinAgent } from "../../agents/index.ts";

const instructionsOf = (agentId: string): string => getBuiltinAgent(agentId)?.systemPrompt ?? "";

export const BACKEND_ENGINEER = {
  id: "backend-engineer",
  name: "Backend Engineer",
  description: "API endpoints, server-side business logic and integrations.",
  responsibilities: ["API development", "backend architecture", "database integration", "performance", "server", "endpoint", "service"],
  skills: ["backend", "api-conventions", "typescript", "testing", "express-backend", "api-design", "typescript-strict", "security-baseline", "principle-fix-root-causes", "principle-prove-it-works", "principle-type-system-discipline", "principle-laziness-protocol", "tdd", "principle-boundary-discipline", "principle-model-the-domain", "principle-make-operations-idempotent"],
  rules: ["Routes parse input and call a service; services never see req/res.", "Report BLOCKED: needs <migration> instead of changing the schema yourself."],
  instructions: instructionsOf("backend-engineer"),
  verification: { preferred: ["typecheck", "tests"] },
} as const;

export const FRONTEND_ENGINEER = {
  id: "frontend-engineer",
  name: "Frontend Engineer",
  description: "User interface, client state and accessibility.",
  responsibilities: ["user interface", "components", "pages", "client state", "accessibility", "styling", "frontend"],
  skills: ["frontend", "typescript", "testing", "react-frontend", "frontend-performance", "typescript-strict", "principle-fix-root-causes", "principle-prove-it-works", "principle-type-system-discipline", "principle-laziness-protocol", "tdd", "principle-experience-first", "principle-minimize-reader-load"],
  rules: ["Components render; logic lives in hooks.", "Every data view handles loading, empty, error and success."],
  instructions: instructionsOf("frontend-engineer"),
  verification: { preferred: ["typecheck", "build"] },
} as const;

export const DATABASE_ENGINEER = {
  id: "database-engineer",
  name: "Database Engineer",
  description: "Schema, migrations, queries and indexes.",
  responsibilities: ["database schema", "migrations", "queries", "indexes", "data model", "sql", "postgres"],
  skills: ["database", "postgres", "typescript", "database-postgres", "principle-make-operations-idempotent", "principle-fix-root-causes", "principle-prove-it-works", "principle-sequence-verifiable-units", "principle-model-the-domain", "principle-foundational-thinking"],
  rules: ["Never edit a merged migration; fix forward.", "Money is bigint minor units or numeric, never float."],
  instructions: instructionsOf("database-engineer"),
  permissions: { filesystem: { write: ["**/migrations/**", "**/prisma/**", "**/drizzle/**", "db/**", "**/*.sql", "**/schema.*", "**/*.repo.ts"] } },
  verification: { preferred: ["typecheck", "tests"] },
} as const;
