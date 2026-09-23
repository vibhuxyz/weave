import type { SessionUpdate } from "@weave/protocol";

export const CONTEXT_LIMIT = 200_000;

export function usage(used: number, size: number = CONTEXT_LIMIT): SessionUpdate {
  return { sessionUpdate: "usage_update", used, size };
}

export function agentText(text: string): SessionUpdate {
  return { sessionUpdate: "agent_message_chunk", content: { type: "text", text } };
}

export const COMMANDS_WITH_COMPACT: SessionUpdate = {
  sessionUpdate: "available_commands_update",
  availableCommands: [
    { name: "compact", description: "Clear conversation history but keep a summary in context" },
    { name: "review", description: "Review a change" },
  ],
};

export const COMMANDS_WITHOUT_COMPACT: SessionUpdate = {
  sessionUpdate: "available_commands_update",
  availableCommands: [{ name: "review", description: "Review a change" }],
};

export const CLAUDE_ACP_0_66_SUCCESS: readonly SessionUpdate[] = [
  agentText("Compacting..."),
  usage(31_000),
  agentText("\n\nCompacting completed."),
];

export const CLAUDE_ACP_0_66_FAILURE: readonly SessionUpdate[] = [
  agentText("Compacting..."),
  agentText("\n\nCompacting failed: Not enough messages to compact."),
];

const CODEX_COMPACTION_META = { contextCompaction: { version: 1 } };

export const CODEX_ACP_1_8_SUCCESS: readonly SessionUpdate[] = [
  {
    sessionUpdate: "tool_call",
    toolCallId: "compaction-1",
    kind: "think",
    title: "Compact conversation",
    status: "in_progress",
    _meta: CODEX_COMPACTION_META,
  },
  {
    sessionUpdate: "tool_call_update",
    toolCallId: "compaction-1",
    title: "Compact conversation",
    status: "completed",
    _meta: CODEX_COMPACTION_META,
  },
  usage(24_000),
];
