import { handoffFromValue, type TeamHandoff } from "@weave/core";
import type { ToolResult } from "./types.ts";

export const HANDOFF_TOOL_NAME = "weave_handoff";

export const HANDOFF_TOOL_DEFINITION = {
  name: HANDOFF_TOOL_NAME,
  description:
    "Ask Weave to start workers on the remaining work. Call this when the rest splits across folders that do not share files, or when the user asks to start workers, run in parallel, or split the work. Each remaining piece names the folders it changes and the pieces it waits for. If this returns an error, fix the arguments and call it again. Then keep working on the files you still own.",
  inputSchema: {
    type: "object",
    properties: {
      reason: { type: "string", description: "Why the rest is faster with more workers" },
      done: { type: "array", items: { type: "string" }, description: "What this chat already finished" },
      remaining: {
        type: "array",
        description: "Each independent piece of the remaining work",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "A short lower-case name for this piece, such as api-health" },
            work: { type: "string", description: "What this worker must do" },
            paths: { type: "array", items: { type: "string" }, description: "The folders this piece changes, such as apps/web. No two pieces may share a folder." },
            dependsOn: { type: "array", items: { type: "string" }, description: "The ids of the pieces that must finish first, or [] when this can start right away" },
          },
          required: ["id", "work", "paths"],
        },
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
