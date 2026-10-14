import { handoffFromValue, type TeamHandoff } from "@weave/core";
import type { ToolResult } from "./types.ts";

export const HANDOFF_TOOL_NAME = "weave_handoff";

export const HANDOFF_TOOL_DEFINITION = {
  name: HANDOFF_TOOL_NAME,
  description:
    "Ask Weave to start workers on the remaining work. Call this when the rest splits across folders that do not share files, or when the user asks to start workers, run in parallel, or split the work. Every remaining item must name a folder. If this returns an error, fix the arguments and call it again. Then keep working on the files you still own.",
  inputSchema: {
    type: "object",
    properties: {
      reason: { type: "string", description: "Why the rest is faster with more workers" },
      done: { type: "array", items: { type: "string" }, description: "What this chat already finished" },
      remaining: {
        type: "array",
        items: { type: "string" },
        description: "Each independent piece, naming the folder it changes, such as apps/web",
      },
      findings: { type: "array", items: { type: "string" }, description: "Facts the other workers need, including any contract they must wait for" },
    },
    required: ["reason", "remaining"],
  },
} as const;

const CLOSED = "This chat cannot add workers right now. A team is already running, or this message stays with one agent.";
const STARTED = "Workers are starting on the remaining work. Keep working on the files you still own. Do not edit the folders you gave away.";

export interface HandoffSlot {
  readonly allow: (open: boolean) => void;
  readonly clear: () => void;
  readonly current: () => TeamHandoff | null;
  readonly submit: (args: unknown) => ToolResult;
  readonly whenAccepted: (listener: () => void) => () => void;
}

export function createHandoffSlot(): HandoffSlot {
  const listeners = new Set<() => void>();
  const state: { accepting: boolean; handoff: TeamHandoff | null } = { accepting: false, handoff: null };
  return {
    allow: (open) => { state.accepting = open; },
    clear: () => { state.handoff = null; },
    current: () => state.handoff,
    whenAccepted: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    submit: (args) => {
      if (!state.accepting) return { text: CLOSED, isError: true };
      if (state.handoff) return { text: STARTED, isError: false };
      const parsed = handoffFromValue(args);
      if (!parsed.ok) return { text: `Cannot add workers: ${parsed.issues.join(" ")} Fix the arguments and call weave_handoff again.`, isError: true };
      state.handoff = parsed.handoff;
      for (const listener of listeners) listener();
      return { text: STARTED, isError: false };
    },
  };
}
