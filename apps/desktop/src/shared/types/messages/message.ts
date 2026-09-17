import type { MessageCompletionStatus, MessageContent } from "./contentBlocks";
import type { MessageRole } from "./wireTypes";

export interface MessageAttachment {
  type: "file" | "url" | "directory";
  name: string;
  path?: string;
  url?: string;
  mimeType?: string;
}

export interface MessageChip {
  id?: string;
  label: string;
  agentRole?: "active" | "mentioned";
  type: "agent" | "skill" | "extension" | "recipe";
}

export interface MessageMetadata {
  userVisible?: boolean;
  agentVisible?: boolean;
  delivery?: "steering" | "steer";
  steeringRequestId?: string;
  origin?: "berdctl_cross_session" | "voice_conversation";
  berdSenderLabel?: string;
  berdDeliveryId?: string;
  voiceUtteranceId?: string;
  voiceConversationLifecycleId?: string;
  voiceConversationRevision?: number;
  attachments?: MessageAttachment[];
  chips?: MessageChip[];
  personaId?: string;
  personaName?: string;
  providerId?: string;
  targetPersonaId?: string;
  targetPersonaName?: string;
  completionStatus?: MessageCompletionStatus;
}

export interface Message {
  id: string;
  role: MessageRole;
  created: number;
  content: MessageContent[];
  metadata?: MessageMetadata;
}
