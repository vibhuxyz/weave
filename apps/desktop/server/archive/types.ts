import type { ChatDirectory } from "../chat/index.ts";
import type { ServerMessage } from "../shared/index.ts";
import type { AUTO_ARCHIVE_DAY_OPTIONS } from "./constants.ts";

export type AutoArchiveDays = (typeof AUTO_ARCHIVE_DAY_OPTIONS)[number];

export type ChatAction = "archive" | "restore" | "delete";

export interface ChatActionRequest {
  readonly sessionId: unknown;
  readonly projectDir: unknown;
}

export interface ChatActionOptions {
  readonly directory: ChatDirectory;
  readonly currentSessionId: () => string | null;
  readonly now: () => number;
  readonly send: (msg: ServerMessage) => void;
  readonly sendChats: () => Promise<void>;
  readonly startNewChat: () => Promise<void>;
}

export interface DeleteProjectOptions {
  readonly directory: ChatDirectory;
  readonly currentProjectId: string;
  readonly weaveHome: string;
  readonly send: (msg: ServerMessage) => void;
}
