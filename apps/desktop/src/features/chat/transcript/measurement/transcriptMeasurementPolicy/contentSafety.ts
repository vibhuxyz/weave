import { addReason, isActiveToolStatus } from "./capabilities";
import type {
  Message,
  MessageContent,
  TranscriptMeasurementSafetyReason,
  TranscriptRowSafetyCapabilities,
} from "./types";

export function applyContentSafety(
  capabilities: TranscriptRowSafetyCapabilities,
  reasons: Set<TranscriptMeasurementSafetyReason>,
  message: Message | undefined,
  content: readonly MessageContent[],
): void {
  const completionStatus = message?.metadata?.completionStatus;
  if (completionStatus === "inProgress") {
    capabilities.hasStreamingContent = true;
    capabilities.hasDynamicAsyncLayout = true;
    addReason(reasons, "active-stream");
    addReason(reasons, "dynamic-async-layout");
  }

  if (message?.metadata?.attachments?.length) {
    capabilities.stateful = true;
    capabilities.hasHostActionHandlers = true;
    addReason(reasons, "stateful-row");
    addReason(reasons, "host-action-handlers");
  }

  for (const block of content) {
    switch (block.type) {
      case "text":
      case "systemNotification":
        break;
      case "image":
        capabilities.stateful = true;
        capabilities.hasImageContent = true;
        capabilities.hasDynamicAsyncLayout = true;
        addReason(reasons, "stateful-row");
        addReason(reasons, "image-content");
        addReason(reasons, "dynamic-async-layout");
        break;
      case "toolRequest":
        capabilities.stateful = true;
        capabilities.hasToolContent = true;
        capabilities.hasDynamicAsyncLayout = true;
        addReason(reasons, "stateful-row");
        addReason(reasons, "tool-content");
        addReason(reasons, "dynamic-async-layout");
        if (isActiveToolStatus(block.status)) {
          capabilities.hasActiveToolWork = true;
          addReason(reasons, "active-tool");
          if (block.startedAt !== undefined) {
            capabilities.hasActiveTimer = true;
            addReason(reasons, "active-timer");
          }
        }
        break;
      case "toolResponse":
        capabilities.stateful = true;
        capabilities.hasToolContent = true;
        addReason(reasons, "stateful-row");
        addReason(reasons, "tool-content");
        break;
      case "mcpApp":
        capabilities.stateful = true;
        capabilities.hasMcpApp = true;
        capabilities.hasHostCalls = true;
        capabilities.hasDynamicAsyncLayout = true;
        addReason(reasons, "stateful-row");
        addReason(reasons, "mcp-app");
        addReason(reasons, "host-calls");
        addReason(reasons, "dynamic-async-layout");
        break;
      case "thinking":
      case "redactedThinking":
      case "reasoning":
        capabilities.stateful = true;
        capabilities.hasReasoningContent = true;
        capabilities.hasDynamicAsyncLayout = true;
        addReason(reasons, "stateful-row");
        addReason(reasons, "reasoning-or-thinking");
        addReason(reasons, "dynamic-async-layout");
        break;
      case "actionRequired":
        capabilities.stateful = true;
        capabilities.hasActionRequired = true;
        capabilities.hasDynamicAsyncLayout = true;
        addReason(reasons, "stateful-row");
        addReason(reasons, "action-required");
        addReason(reasons, "dynamic-async-layout");
        break;
      default:
        block satisfies never;
    }
  }
}
