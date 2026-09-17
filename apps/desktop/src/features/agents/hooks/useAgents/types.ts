import type { ProjectTone } from "@/features/projects/components";

export interface Agent {
  id: string;
  name: string;
  description: string;
  instructions: string;
  /** Engine id from ENGINES (the "provider"). */
  engineId?: string;
  /** A `model`-category config value applied after the session connects. */
  model?: string;
  tint?: ProjectTone;
  /** Custom avatar as a data URI; overrides the character art. */
  icon?: string;
  /** A bundled character the user picked, by key (see `characters.ts`). */
  character?: string;
  builtin?: boolean;
  createdAt: number;
  updatedAt: number;
}

export type AgentDraft = Omit<Agent, "id" | "createdAt" | "updatedAt" | "builtin">;

export function isAgent(v: unknown): v is Agent {
  return (
    !!v &&
    typeof (v as Agent).id === "string" &&
    typeof (v as Agent).name === "string"
  );
}
