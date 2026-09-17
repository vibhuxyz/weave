import type {
  SystemNotificationAction,
  SystemNotificationContent,
} from "./contentBlocks";
import { isTextContent } from "./guards";
import type { Message, MessageAttachment, MessageChip } from "./message";

export function getTextContent(message: Message): string {
  return message.content
    .filter(isTextContent)
    .map((c) => c.text)
    .join("\n");
}

export function createUserMessage(
  text: string,
  attachments?: MessageAttachment[],
  chips?: MessageChip[],
): Message {
  return {
    id: crypto.randomUUID(),
    role: "user",
    created: Date.now(),
    content: [{ type: "text", text }],
    metadata: {
      userVisible: true,
      agentVisible: true,
      ...(attachments ? { attachments } : {}),
      ...(chips && chips.length > 0 ? { chips } : {}),
    },
  };
}

export function createSystemNotificationMessage(
  text: string,
  notificationType: SystemNotificationContent["notificationType"] = "info",
  action?: SystemNotificationAction,
): Message {
  return {
    id: crypto.randomUUID(),
    role: "system",
    created: Date.now(),
    content: [
      {
        type: "systemNotification",
        notificationType,
        text,
        ...(action && { action }),
      },
    ],
    metadata: {
      userVisible: true,
      agentVisible: false,
    },
  };
}
