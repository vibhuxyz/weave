import type {
  ActionRequiredContent,
  McpAppContent,
  MessageContent,
  ReasoningContent,
  SystemNotificationContent,
  ThinkingContent,
  ToolRequestContent,
  ToolResponseContent,
} from "./contentBlocks";
import type { ImageContent, TextContent } from "./wireTypes";

export function isTextContent(c: MessageContent): c is TextContent {
  return c.type === "text";
}
export function isImageContent(c: MessageContent): c is ImageContent {
  return c.type === "image";
}
export function isToolRequest(c: MessageContent): c is ToolRequestContent {
  return c.type === "toolRequest";
}
export function isToolResponse(c: MessageContent): c is ToolResponseContent {
  return c.type === "toolResponse";
}
export function isMcpApp(c: MessageContent): c is McpAppContent {
  return c.type === "mcpApp";
}
export function isThinking(c: MessageContent): c is ThinkingContent {
  return c.type === "thinking";
}
export function isReasoning(c: MessageContent): c is ReasoningContent {
  return c.type === "reasoning";
}
export function isActionRequired(
  c: MessageContent,
): c is ActionRequiredContent {
  return c.type === "actionRequired";
}
export function isSystemNotification(
  c: MessageContent,
): c is SystemNotificationContent {
  return c.type === "systemNotification";
}
