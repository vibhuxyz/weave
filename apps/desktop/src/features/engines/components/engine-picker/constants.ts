export interface DisplayAgent {
  id: string;
  label: string;
}

export interface DisplayModel {
  value: string;
  name: string;
}

export interface DisplayEffort {
  value: string;
  label: string;
}

export const DISPLAY_AGENTS: readonly DisplayAgent[] = [
  { id: "claude-code", label: "Claude Code" },
  { id: "codex", label: "Codex" },
  { id: "antigravity", label: "Gemini" },
] as const;

export const REASONING_EFFORTS: readonly DisplayEffort[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Xhigh" },
] as const;
