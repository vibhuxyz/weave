import type { ProjectTone } from "@/features/projects/components";

export type AgentOrigin =
  | { readonly kind: "employee"; readonly source: "builtin" | "user" | "project" }
  | { readonly kind: "persona" };

export interface Agent {
  id: string;
  name: string;
  description: string;
  instructions: string;
  engineId?: string;
  model?: string;
  tint?: ProjectTone;
  icon?: string;
  character?: string;
  builtin?: boolean;
  origin: AgentOrigin;
  createdAt: number;
  updatedAt: number;
}

type StoredAgent = Omit<Agent, "origin">;

export function isStoredAgent(value: unknown): value is StoredAgent {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "name" in value &&
    typeof value.name === "string"
  );
}

export function personaOf(stored: StoredAgent): Agent {
  return { ...stored, builtin: false, origin: { kind: "persona" } };
}
