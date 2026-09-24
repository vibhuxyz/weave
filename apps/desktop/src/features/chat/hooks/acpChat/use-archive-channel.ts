import { useCallback, useRef, useState, type RefObject } from "react";
import type { ServerMessage } from "../../../../../server/index.ts";
import type { ArchivedChatMeta, ConversationMeta } from "./types";

type ChatListByProject<T> = Record<string, T[]>;

function copyLists<T>(lists: Readonly<Record<string, readonly T[]>>): ChatListByProject<T> {
  return Object.fromEntries(Object.entries(lists).map(([dir, list]) => [dir, [...list]]));
}

export interface ArchiveChannelOptions {
  readonly onProjectDeleted?: (projectDir: string) => void;
}

export function useArchiveChannel(socketRef: RefObject<WebSocket | null>, options: ArchiveChannelOptions) {
  const [chatsByProject, setChatsByProject] = useState<ChatListByProject<ConversationMeta>>({});
  const [archivedChatsByProject, setArchivedChatsByProject] = useState<ChatListByProject<ArchivedChatMeta>>({});
  const [autoArchiveAfterDays, setAutoArchiveAfterDays] = useState<number | null>(null);
  const [isChatListLoaded, setIsChatListLoaded] = useState(false);
  const [isArchiveSettingsLoaded, setIsArchiveSettingsLoaded] = useState(false);
  const requestedDirsRef = useRef<readonly string[]>([]);
  const onProjectDeletedRef = useRef(options.onProjectDeleted);
  onProjectDeletedRef.current = options.onProjectDeleted;

  const sendMessage = useCallback(
    (payload: Readonly<Record<string, unknown>>) => {
      const socket = socketRef.current;
      if (socket?.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify(payload));
    },
    [socketRef],
  );

  const requestProjectChats = useCallback(
    (projectDirs: readonly string[]) => {
      requestedDirsRef.current = projectDirs;
      sendMessage({ type: "list-project-chats", projectDirs });
    },
    [sendMessage],
  );

  const refreshProjectChats = useCallback(() => {
    sendMessage({ type: "list-project-chats", projectDirs: requestedDirsRef.current });
  }, [sendMessage]);

  const handleMessage = useCallback(
    (message: ServerMessage): boolean => {
      switch (message.type) {
        case "project-chats":
          setChatsByProject(copyLists(message.chatsByProject));
          setArchivedChatsByProject(copyLists(message.archivedChatsByProject));
          setIsChatListLoaded(true);
          return true;
        case "archive-settings":
          setAutoArchiveAfterDays(message.autoArchiveAfterDays);
          setIsArchiveSettingsLoaded(true);
          return true;
        case "project-deleted":
          onProjectDeletedRef.current?.(message.projectDir);
          refreshProjectChats();
          return true;
        case "chat-archived":
        case "chat-restored":
        case "chat-deleted":
          refreshProjectChats();
          return true;
        default:
          return false;
      }
    },
    [refreshProjectChats],
  );

  const reset = useCallback(() => {
    setChatsByProject({});
    setArchivedChatsByProject({});
    setIsChatListLoaded(false);
    setIsArchiveSettingsLoaded(false);
  }, []);

  const archiveChat = useCallback(
    (sessionId: string, projectDir: string) => sendMessage({ type: "archive-chat", sessionId, projectDir }),
    [sendMessage],
  );
  const restoreChat = useCallback(
    (sessionId: string, projectDir: string) => sendMessage({ type: "restore-chat", sessionId, projectDir }),
    [sendMessage],
  );
  const deleteChat = useCallback(
    (sessionId: string, projectDir: string) => sendMessage({ type: "delete-chat", sessionId, projectDir }),
    [sendMessage],
  );
  const deleteProject = useCallback((projectDir: string) => sendMessage({ type: "delete-project", projectDir }), [sendMessage]);
  const setAutoArchive = useCallback(
    (afterDays: number | null) => sendMessage({ type: "set-auto-archive", afterDays }),
    [sendMessage],
  );

  return {
    chatsByProject,
    archivedChatsByProject,
    autoArchiveAfterDays,
    isChatListLoaded,
    isArchiveSettingsLoaded,
    requestProjectChats,
    archiveChat,
    restoreChat,
    deleteChat,
    deleteProject,
    setAutoArchive,
    handleMessage,
    reset,
  };
}
