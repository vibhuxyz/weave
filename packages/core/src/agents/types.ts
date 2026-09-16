export type AgentId =
  | "frontend-engineer"
  | "backend-engineer"
  | "database-engineer"
  | "devops-engineer"
  | "ai-engineer"
  | "reviewer";

export type AgentAccess = "write" | "read-only";

export interface AgentProfile {
  id: AgentId;
  role: string;
  description: string;
  access: AgentAccess;
  skills: readonly string[];
  systemPrompt: string;
}
