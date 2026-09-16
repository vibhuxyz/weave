export type ToolCallUpdateLike = {
  sessionUpdate: "tool_call";
  toolCallId: string;
  title: string;
  kind?: string;
  status?: string;
  locations?: Array<{ path: string }>;
};

export type ToolCallStatusUpdateLike = {
  sessionUpdate: "tool_call_update";
  toolCallId: string;
  title?: string | null;
  kind?: string | null;
  status?: string | null;
  locations?: Array<{ path: string }> | null;
};

export type PlanUpdateLike = {
  sessionUpdate: "plan";
  entries: Array<{ content: string; status: "pending" | "in_progress" | "completed" }>;
};

export const READ_KINDS = new Set(["read", "search", "fetch"]);
export const WRITE_KINDS = new Set(["edit", "move"]);
