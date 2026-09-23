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

export const MODEL_SKELETON_WIDTHS: readonly string[] = ["w-[70%]", "w-[55%]", "w-[62%]", "w-[48%]", "w-[76%]"] as const;
export const EFFORT_SKELETON_WIDTHS: readonly string[] = ["w-[40%]", "w-[58%]", "w-[45%]", "w-[52%]"] as const;
export const SKELETON_STAGGER_MS = 90;
