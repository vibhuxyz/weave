import type {
  Annotations,
  ToolCallLocation as AcpToolCallLocation,
  ToolKind,
} from "@agentclientprotocol/sdk";
import type { GooseReadResourceResult, GooseToolMetadata } from "./gooseTypes";
import type { ImageContent, TextContent, ToolCallStatus } from "./wireTypes";

// ── Renderer-only content block types ─────────────────────────────────
//
// These types have no ACP equivalent. They are synthesized by the
// notification handler from _meta payloads, tool call reductions, or
// local UI events.

export type MessageCompletionStatus =
  | "inProgress"
  | "completed"
  | "error"
  | "stopped";

export interface ToolChainSummary {
  summary: string;
  count: number;
}

export interface ToolRequestContent {
  type: "toolRequest";
  id: string;
  name: string;
  toolName?: string;
  extensionName?: string;
  arguments: Record<string, unknown>;
  status: ToolCallStatus;
  toolKind?: ToolKind;
  locations?: AcpToolCallLocation[];
  startedAt?: number;
  annotations?: Annotations;
  chainSummary?: ToolChainSummary;
  /**
   * For subagent await/peek/cancel calls (e.g. goose `load <task-id>`): the
   * named source (custom agent/recipe) of the delegate that spawned the task,
   * resolved from the delegate's result in this session's transcript.
   */
  subagentAgentName?: string;
  /** Plain-language task recovered from the spawning delegate. */
  subagentTaskLabel?: string;
  /** The named Goose source owns a configured task when no instructions were supplied. */
  subagentTaskIsConfigured?: boolean;
}

export interface ToolResponseContent {
  type: "toolResponse";
  id: string;
  name: string;
  result: string;
  structuredContent?: unknown;
  isError: boolean;
  annotations?: Annotations;
}

export interface McpAppPayload {
  sessionId: string;
  toolCallId: string;
  toolCallTitle: string;
  source: "toolCallUpdateMeta";
  tool: {
    name: string;
    extensionName: string;
    resourceUri: string;
    meta?: GooseToolMetadata;
  };
  resource: {
    result: GooseReadResourceResult | null;
    readError?: string;
  };
}

export interface McpAppContent {
  type: "mcpApp";
  id: string;
  payload: McpAppPayload;
}

export interface ThinkingContent {
  type: "thinking";
  text: string;
  annotations?: Annotations;
}

export interface RedactedThinkingContent {
  type: "redactedThinking";
  annotations?: Annotations;
}

export interface ReasoningContent {
  type: "reasoning";
  text: string;
  annotations?: Annotations;
}

export interface ActionRequiredContent {
  type: "actionRequired";
  id: string;
  actionType: "toolConfirmation" | "elicitation";
  message?: string;
  toolName?: string;
  arguments?: Record<string, unknown>;
  schema?: Record<string, unknown>;
  annotations?: Annotations;
}

/**
 * An optional call-to-action rendered alongside a system notification. Lets a
 * notification (e.g. a session-creation error) carry the fix the user should
 * take, so the action lives with its message instead of floating elsewhere.
 */
export type SystemNotificationAction =
  | {
      type: "editProject";
      projectId: string;
    }
  | {
      type: "openContextPanel";
    };

export interface SystemNotificationContent {
  type: "systemNotification";
  notificationType: "compaction" | "info" | "warning" | "error";
  text: string;
  action?: SystemNotificationAction;
  annotations?: Annotations;
}

// ── Message content union ──────────────────────────────────────────────

export type MessageContent =
  | TextContent
  | ImageContent
  | ToolRequestContent
  | ToolResponseContent
  | McpAppContent
  | ThinkingContent
  | RedactedThinkingContent
  | ReasoningContent
  | ActionRequiredContent
  | SystemNotificationContent;
